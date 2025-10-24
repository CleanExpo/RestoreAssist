/**
 * Database Seeder for Development and Testing
 * Populates database with sample data for testing purposes
 */

import { db } from './connection';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

interface SeedOptions {
  clearExisting?: boolean;
  users?: number;
  reports?: number;
  organizations?: number;
  verbose?: boolean;
}

export class DatabaseSeeder {
  private log(message: string, verbose: boolean = true) {
    if (verbose) {
      console.log(`🌱 ${message}`);
    }
  }

  /**
   * Seed all data
   */
  async seed(options: SeedOptions = {}): Promise<void> {
    const {
      clearExisting = true,
      users = 5,
      reports = 20,
      organizations = 3,
      verbose = true
    } = options;

    try {
      if (clearExisting) {
        await this.clearData(verbose);
      }

      await this.seedUsers(users, verbose);
      await this.seedOrganizations(organizations, verbose);
      await this.seedReports(reports, verbose);
      await this.seedSubscriptions(users, verbose);
      await this.seedTrialData(users, verbose);

      this.log('✅ Database seeding completed successfully', verbose);
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      throw error;
    }
  }

  /**
   * Clear existing data
   */
  private async clearData(verbose: boolean): Promise<void> {
    this.log('Clearing existing data...', verbose);

    const tables = [
      'trial_usage',
      'trial_fraud_flags',
      'free_trial_tokens',
      'login_sessions',
      'device_fingerprints',
      'auth_attempts',
      'payment_verifications',
      'subscription_history',
      'user_subscriptions',
      'ascora_sync_schedules',
      'ascora_sync_logs',
      'ascora_invoices',
      'ascora_customers',
      'ascora_jobs',
      'ascora_integrations',
      'organization_members',
      'organizations',
      'reports',
      'users'
    ];

    for (const table of tables) {
      try {
        await db.none(`DELETE FROM ${table}`);
        this.log(`Cleared ${table}`, verbose);
      } catch (error) {
        // Table might not exist, continue
      }
    }
  }

  /**
   * Seed users
   */
  private async seedUsers(count: number, verbose: boolean): Promise<void> {
    this.log(`Creating ${count} users...`, verbose);

    const users = [];
    const hashedPassword = await bcrypt.hash('TestPass123!', 10);

    for (let i = 1; i <= count; i++) {
      users.push({
        user_id: uuidv4(),
        email: `user${i}@example.com`,
        password_hash: hashedPassword,
        name: `Test User ${i}`,
        google_id: i === 1 ? `google_${uuidv4()}` : null,
        email_verified: i <= 3,
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    for (const user of users) {
      await db.none(
        `INSERT INTO users (user_id, email, password_hash, name, google_id, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.user_id,
          user.email,
          user.password_hash,
          user.name,
          user.google_id,
          user.email_verified,
          user.created_at,
          user.updated_at
        ]
      );
    }

    this.log(`Created ${count} users`, verbose);
  }

  /**
   * Seed organizations
   */
  private async seedOrganizations(count: number, verbose: boolean): Promise<void> {
    this.log(`Creating ${count} organizations...`, verbose);

    const users = await db.manyOrNone('SELECT user_id FROM users LIMIT $1', [count]);

    for (let i = 0; i < Math.min(count, users.length); i++) {
      const org = {
        id: uuidv4(),
        slug: `org-${i + 1}`,
        name: `Organization ${i + 1}`,
        description: `Test organization ${i + 1}`,
        owner_id: users[i].user_id,
        subscription_tier: i === 0 ? 'pro' : i === 1 ? 'business' : 'free',
        created_at: new Date(),
        updated_at: new Date()
      };

      await db.none(
        `INSERT INTO organizations (id, slug, name, description, owner_id, subscription_tier, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [org.id, org.slug, org.name, org.description, org.owner_id, org.subscription_tier, org.created_at, org.updated_at]
      );
    }

    this.log(`Created ${count} organizations`, verbose);
  }

  /**
   * Seed reports
   */
  private async seedReports(count: number, verbose: boolean): Promise<void> {
    this.log(`Creating ${count} reports...`, verbose);

    const damageTypes = ['Water', 'Fire', 'Storm', 'Flood', 'Mould', 'Biohazard', 'Impact', 'Other'];
    const states = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

    for (let i = 1; i <= count; i++) {
      const report = {
        report_id: uuidv4(),
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
        property_address: `${i} Test Street, Test City`,
        damage_type: damageTypes[Math.floor(Math.random() * damageTypes.length)],
        damage_description: `Test damage description ${i}`,
        state: states[Math.floor(Math.random() * states.length)],
        summary: `This is a test report summary for report ${i}. It contains detailed information about the damage assessment.`,
        recommendations: JSON.stringify([
          'Immediate water extraction required',
          'Dehumidification process',
          'Antimicrobial treatment'
        ]),
        scope_of_work: JSON.stringify({
          immediate: ['Extract water', 'Set up drying equipment'],
          restoration: ['Replace damaged materials', 'Paint and finish'],
          timeline: '2-3 weeks'
        }),
        itemized_estimate: JSON.stringify([
          { item: 'Water extraction', cost: 500 },
          { item: 'Drying equipment', cost: 1200 },
          { item: 'Materials', cost: 3000 },
          { item: 'Labor', cost: 2500 }
        ]),
        total_cost: 5000 + Math.random() * 20000,
        compliance_notes: JSON.stringify({
          standards: ['AS/NZS 3500', 'Building Code of Australia'],
          permits: ['Minor works permit required']
        }),
        authority_to_proceed: 'Approved by insurance adjuster',
        client_name: `Client ${i}`,
        insurance_company: i % 2 === 0 ? 'Test Insurance Co' : 'Example Insurers',
        claim_number: `CLM-2025-${String(i).padStart(5, '0')}`,
        generated_by: 'RestoreAssist AI',
        model: 'claude-3-opus',
        severity: i % 3 === 0 ? 'High' : i % 2 === 0 ? 'Medium' : 'Low',
        urgent: i % 5 === 0,
        timeline: '2-4 weeks'
      };

      await db.none(
        `INSERT INTO reports (
          report_id, timestamp, property_address, damage_type, damage_description,
          state, summary, recommendations, scope_of_work, itemized_estimate,
          total_cost, compliance_notes, authority_to_proceed, client_name,
          insurance_company, claim_number, generated_by, model, severity, urgent, timeline
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )`,
        [
          report.report_id,
          report.timestamp,
          report.property_address,
          report.damage_type,
          report.damage_description,
          report.state,
          report.summary,
          report.recommendations,
          report.scope_of_work,
          report.itemized_estimate,
          report.total_cost,
          report.compliance_notes,
          report.authority_to_proceed,
          report.client_name,
          report.insurance_company,
          report.claim_number,
          report.generated_by,
          report.model,
          report.severity,
          report.urgent,
          report.timeline
        ]
      );
    }

    this.log(`Created ${count} reports`, verbose);
  }

  /**
   * Seed subscriptions
   */
  private async seedSubscriptions(userCount: number, verbose: boolean): Promise<void> {
    this.log('Creating subscriptions...', verbose);

    const users = await db.manyOrNone('SELECT user_id FROM users LIMIT $1', [userCount]);

    for (let i = 0; i < Math.min(3, users.length); i++) {
      const subscription = {
        subscription_id: uuidv4(),
        user_id: users[i].user_id,
        stripe_customer_id: `cus_test_${uuidv4().substring(0, 8)}`,
        stripe_subscription_id: `sub_test_${uuidv4().substring(0, 8)}`,
        plan_id: i === 0 ? 'pro_monthly' : i === 1 ? 'business_monthly' : 'starter_monthly',
        status: 'active',
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancel_at_period_end: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      await db.none(
        `INSERT INTO user_subscriptions (
          subscription_id, user_id, stripe_customer_id, stripe_subscription_id,
          plan_id, status, current_period_start, current_period_end,
          cancel_at_period_end, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          subscription.subscription_id,
          subscription.user_id,
          subscription.stripe_customer_id,
          subscription.stripe_subscription_id,
          subscription.plan_id,
          subscription.status,
          subscription.current_period_start,
          subscription.current_period_end,
          subscription.cancel_at_period_end,
          subscription.created_at,
          subscription.updated_at
        ]
      );
    }

    this.log('Created subscriptions', verbose);
  }

  /**
   * Seed trial data
   */
  private async seedTrialData(userCount: number, verbose: boolean): Promise<void> {
    this.log('Creating trial data...', verbose);

    const users = await db.manyOrNone('SELECT user_id FROM users LIMIT $1', [userCount]);

    // Create trial tokens for some users
    for (let i = 3; i < Math.min(5, users.length); i++) {
      const token = {
        token_id: uuidv4(),
        user_id: users[i].user_id,
        token_hash: await bcrypt.hash(`trial_token_${i}`, 10),
        status: 'active',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        created_at: new Date()
      };

      await db.none(
        `INSERT INTO free_trial_tokens (token_id, user_id, token_hash, status, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [token.token_id, token.user_id, token.token_hash, token.status, token.expires_at, token.created_at]
      );

      // Add trial usage
      await db.none(
        `INSERT INTO trial_usage (usage_id, user_id, token_id, action, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), token.user_id, token.token_id, 'report_generated', new Date()]
      );
    }

    this.log('Created trial data', verbose);
  }

  /**
   * Verify seeded data
   */
  async verify(): Promise<{
    users: number;
    organizations: number;
    reports: number;
    subscriptions: number;
    trials: number;
  }> {
    const counts = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM organizations) as organizations,
        (SELECT COUNT(*) FROM reports WHERE deleted_at IS NULL) as reports,
        (SELECT COUNT(*) FROM user_subscriptions) as subscriptions,
        (SELECT COUNT(*) FROM free_trial_tokens) as trials
    `);

    return {
      users: parseInt(counts.users),
      organizations: parseInt(counts.organizations),
      reports: parseInt(counts.reports),
      subscriptions: parseInt(counts.subscriptions),
      trials: parseInt(counts.trials)
    };
  }
}

// CLI usage
if (require.main === module) {
  const seeder = new DatabaseSeeder();
  const command = process.argv[2];

  if (command === 'verify') {
    seeder.verify()
      .then(counts => {
        console.log('📊 Database counts:', counts);
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Verification failed:', error);
        process.exit(1);
      });
  } else {
    seeder.seed({
      clearExisting: true,
      users: 10,
      reports: 50,
      organizations: 5,
      verbose: true
    })
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}

export const dbSeeder = new DatabaseSeeder();