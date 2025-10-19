import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import crypto from 'crypto';

// =====================================================
// Types & Interfaces
// =====================================================

export interface PaymentVerification {
  verificationId: string;
  userId: string;
  cardFingerprint?: string;
  cardLast4?: string;
  cardBrand?: string;
  verificationStatus: 'success' | 'failed' | 'pending';
  stripePaymentMethodId?: string;
  amountCents: number;
  verificationDate: Date;
  failureReason?: string;
  reuseCount: number;
}

export interface VerifyCardRequest {
  userId: string;
  paymentMethodId: string; // Stripe payment method ID
}

export interface VerifyCardResult {
  success: boolean;
  verification?: PaymentVerification;
  error?: string;
  requiresAction?: boolean;
  clientSecret?: string;
}

// =====================================================
// Configuration
// =====================================================

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const VERIFICATION_AMOUNT = 100; // $1.00 test charge (in cents)
const MAX_CARD_REUSE = 3; // Maximum times a card can be used across accounts

// =====================================================
// Payment Verification Service
// =====================================================

class PaymentVerificationService {
  private stripe: Stripe | null = null;

  constructor() {
    if (STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: '2024-12-18.acacia',
      });
    }
  }

  /**
   * Generate a unique fingerprint for a card
   */
  private generateCardFingerprint(cardLast4: string, cardBrand: string, expiryMonth: number, expiryYear: number): string {
    const data = `${cardBrand}-${cardLast4}-${expiryMonth}-${expiryYear}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Check if card has been reused too many times
   */
  private async checkCardReuse(cardFingerprint: string): Promise<{ allowed: boolean; reuseCount: number }> {
    const result = await db.oneOrNone<{ count: number }>(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM payment_verifications
       WHERE card_fingerprint = $1 AND verification_status = 'success'`,
      [cardFingerprint]
    );

    const reuseCount = result?.count || 0;
    const allowed = reuseCount < MAX_CARD_REUSE;

    return { allowed, reuseCount };
  }

  /**
   * Verify a payment method without charging
   * Uses Stripe Setup Intent for card validation
   */
  async verifyCard(request: VerifyCardRequest): Promise<VerifyCardResult> {
    if (!this.stripe) {
      return {
        success: false,
        error: 'Stripe is not configured',
      };
    }

    const { userId, paymentMethodId } = request;

    try {
      // Retrieve payment method details
      const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);

      if (!paymentMethod.card) {
        return {
          success: false,
          error: 'Payment method is not a card',
        };
      }

      const cardLast4 = paymentMethod.card.last4;
      const cardBrand = paymentMethod.card.brand;
      const expiryMonth = paymentMethod.card.exp_month;
      const expiryYear = paymentMethod.card.exp_year;

      // Generate card fingerprint
      const cardFingerprint = this.generateCardFingerprint(
        cardLast4,
        cardBrand,
        expiryMonth,
        expiryYear
      );

      // Check card reuse
      const reuseCheck = await this.checkCardReuse(cardFingerprint);
      if (!reuseCheck.allowed) {
        // Save failed verification
        const verification = await this.saveVerification({
          userId,
          cardFingerprint,
          cardLast4,
          cardBrand,
          verificationStatus: 'failed',
          stripePaymentMethodId: paymentMethodId,
          amountCents: VERIFICATION_AMOUNT,
          failureReason: `Card reused too many times (${reuseCheck.reuseCount} accounts)`,
          reuseCount: reuseCheck.reuseCount,
        });

        return {
          success: false,
          error: 'This card has been used too many times',
          verification,
        };
      }

      // Create a Setup Intent to verify the card without charging
      const setupIntent = await this.stripe.setupIntents.create({
        payment_method: paymentMethodId,
        confirm: true,
        payment_method_types: ['card'],
      });

      if (setupIntent.status === 'succeeded') {
        // Card verified successfully
        const verification = await this.saveVerification({
          userId,
          cardFingerprint,
          cardLast4,
          cardBrand,
          verificationStatus: 'success',
          stripePaymentMethodId: paymentMethodId,
          amountCents: VERIFICATION_AMOUNT,
          reuseCount: reuseCheck.reuseCount,
        });

        return {
          success: true,
          verification,
        };
      } else if (setupIntent.status === 'requires_action') {
        // 3D Secure or other authentication required
        const verification = await this.saveVerification({
          userId,
          cardFingerprint,
          cardLast4,
          cardBrand,
          verificationStatus: 'pending',
          stripePaymentMethodId: paymentMethodId,
          amountCents: VERIFICATION_AMOUNT,
          reuseCount: reuseCheck.reuseCount,
        });

        return {
          success: false,
          requiresAction: true,
          clientSecret: setupIntent.client_secret || undefined,
          verification,
        };
      } else {
        // Verification failed
        const verification = await this.saveVerification({
          userId,
          cardFingerprint,
          cardLast4,
          cardBrand,
          verificationStatus: 'failed',
          stripePaymentMethodId: paymentMethodId,
          amountCents: VERIFICATION_AMOUNT,
          failureReason: `Setup Intent status: ${setupIntent.status}`,
          reuseCount: reuseCheck.reuseCount,
        });

        return {
          success: false,
          error: 'Card verification failed',
          verification,
        };
      }
    } catch (error) {
      console.error('Payment verification error:', error);

      // Save failed verification
      const verification = await this.saveVerification({
        userId,
        verificationStatus: 'failed',
        stripePaymentMethodId: paymentMethodId,
        amountCents: VERIFICATION_AMOUNT,
        failureReason: error instanceof Error ? error.message : 'Unknown error',
        reuseCount: 0,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment verification failed',
        verification,
      };
    }
  }

  /**
   * Save payment verification to database
   */
  private async saveVerification(data: {
    userId: string;
    cardFingerprint?: string;
    cardLast4?: string;
    cardBrand?: string;
    verificationStatus: 'success' | 'failed' | 'pending';
    stripePaymentMethodId?: string;
    amountCents: number;
    failureReason?: string;
    reuseCount: number;
  }): Promise<PaymentVerification> {
    const verification = await db.one<PaymentVerification>(
      `INSERT INTO payment_verifications
       (verification_id, user_id, card_fingerprint, card_last4, card_brand, verification_status,
        stripe_payment_method_id, amount_cents, verification_date, failure_reason, reuse_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10)
       RETURNING *`,
      [
        uuidv4(),
        data.userId,
        data.cardFingerprint || null,
        data.cardLast4 || null,
        data.cardBrand || null,
        data.verificationStatus,
        data.stripePaymentMethodId || null,
        data.amountCents,
        data.failureReason || null,
        data.reuseCount,
      ]
    );

    return verification;
  }

  /**
   * Get verification by ID
   */
  async getVerification(verificationId: string): Promise<PaymentVerification | null> {
    const verification = await db.oneOrNone<PaymentVerification>(
      `SELECT * FROM payment_verifications WHERE verification_id = $1`,
      [verificationId]
    );

    return verification;
  }

  /**
   * Get all verifications for a user
   */
  async getUserVerifications(userId: string): Promise<PaymentVerification[]> {
    const verifications = await db.manyOrNone<PaymentVerification>(
      `SELECT * FROM payment_verifications
       WHERE user_id = $1
       ORDER BY verification_date DESC`,
      [userId]
    );

    return verifications || [];
  }

  /**
   * Check if user has a successful verification
   */
  async hasSuccessfulVerification(userId: string): Promise<boolean> {
    const verification = await db.oneOrNone(
      `SELECT verification_id FROM payment_verifications
       WHERE user_id = $1 AND verification_status = 'success'
       LIMIT 1`,
      [userId]
    );

    return !!verification;
  }

  /**
   * Update verification status (for handling async 3D Secure)
   */
  async updateVerificationStatus(
    verificationId: string,
    status: 'success' | 'failed',
    failureReason?: string
  ): Promise<PaymentVerification | null> {
    const verification = await db.oneOrNone<PaymentVerification>(
      `UPDATE payment_verifications
       SET verification_status = $1, failure_reason = $2
       WHERE verification_id = $3
       RETURNING *`,
      [status, failureReason || null, verificationId]
    );

    return verification;
  }

  /**
   * Check if Stripe is configured
   */
  isConfigured(): boolean {
    return !!this.stripe;
  }
}

// Singleton instance
export const paymentVerificationService = new PaymentVerificationService();
