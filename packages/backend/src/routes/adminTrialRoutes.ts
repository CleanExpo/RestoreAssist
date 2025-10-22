import express, { Request, Response } from 'express';
import { db } from '../db/connection';

const router = express.Router();

// Admin endpoint to clear user trial data
router.post('/clear-trial/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    console.log(`🔍 Admin: Clearing trial for ${email}`);

    // Find user
    const user = await db.oneOrNone(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete trial tokens
    const deletedTokens = await db.result(
      `DELETE FROM free_trial_tokens WHERE user_id = $1`,
      [user.user_id]
    );

    // Reset device fingerprints
    const resetFingerprints = await db.result(
      `UPDATE device_fingerprints
       SET trial_count = 0, is_blocked = false, blocked_reason = NULL
       WHERE user_id = $1`,
      [user.user_id]
    );

    // Delete fraud flags
    const deletedFlags = await db.result(
      `DELETE FROM trial_fraud_flags WHERE user_id = $1`,
      [user.user_id]
    );

    console.log(`✅ Cleared trial data for ${email}`);
    console.log(`   - Deleted ${deletedTokens.rowCount} trial tokens`);
    console.log(`   - Reset ${resetFingerprints.rowCount} device fingerprints`);
    console.log(`   - Deleted ${deletedFlags.rowCount} fraud flags`);

    res.json({
      success: true,
      message: `Trial data cleared for ${email}`,
      cleared: {
        tokens: deletedTokens.rowCount,
        fingerprints: resetFingerprints.rowCount,
        flags: deletedFlags.rowCount,
      },
    });

  } catch (error) {
    console.error('Error clearing trial:', error);
    res.status(500).json({ error: 'Failed to clear trial data' });
  }
});

// Admin endpoint to manually override fraud detection and approve trial
router.post('/override-trial/:email', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const { reason } = req.body;

    console.log(`🔍 Admin: Manual trial override for ${email}`);
    console.log(`   Reason: ${reason || 'No reason provided'}`);

    // Find user
    const user = await db.oneOrNone(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Clear existing fraud flags
    await db.query(
      `DELETE FROM trial_fraud_flags WHERE user_id = $1`,
      [user.user_id]
    );

    // Unblock device if blocked
    await db.query(
      `UPDATE device_fingerprints
       SET is_blocked = false, blocked_reason = NULL
       WHERE user_id = $1`,
      [user.user_id]
    );

    // Check if user already has active trial
    const existingTrial = await db.oneOrNone(
      `SELECT * FROM free_trial_tokens
       WHERE user_id = $1 AND status IN ('pending', 'active')
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.user_id]
    );

    if (existingTrial) {
      console.log(`✅ User ${email} already has active trial: ${existingTrial.token_id}`);
      return res.json({
        success: true,
        message: `User ${email} already has an active trial`,
        trial: {
          tokenId: existingTrial.token_id,
          status: existingTrial.status,
          reportsRemaining: existingTrial.reports_remaining,
          expiresAt: existingTrial.expires_at,
        },
      });
    }

    // Create new trial token manually
    const tokenId = `trial-override-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await db.query(
      `INSERT INTO free_trial_tokens
       (token_id, user_id, status, activated_at, expires_at, reports_remaining, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tokenId, user.user_id, 'active', new Date(), expiresAt, 3, new Date(), new Date()]
    );

    // Log override action
    await db.query(
      `INSERT INTO trial_fraud_flags
       (flag_id, user_id, flag_type, severity, fraud_score, details, created_at, resolved, resolved_at, resolution_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `flag-${Date.now()}`,
        user.user_id,
        'admin_override',
        'low',
        0,
        JSON.stringify({ action: 'manual_trial_approval', reason: reason || 'Admin override' }),
        new Date(),
        true,
        new Date(),
        `Admin manually approved trial. Reason: ${reason || 'No reason provided'}`,
      ]
    );

    console.log(`✅ Manual trial approved for ${email}`);
    console.log(`   Token ID: ${tokenId}`);
    console.log(`   Expires: ${expiresAt.toISOString()}`);

    res.json({
      success: true,
      message: `Trial manually approved for ${email}`,
      trial: {
        tokenId,
        status: 'active',
        reportsRemaining: 3,
        expiresAt: expiresAt.toISOString(),
      },
    });

  } catch (error) {
    console.error('Error overriding trial:', error);
    res.status(500).json({ error: 'Failed to override trial' });
  }
});

export default router;
