import { db } from './src/db/connection';

const EMAIL_TO_CLEAR = 'phil.mcgurk@gmail.com';

async function clearUserTrial() {
  try {
    console.log(`🔍 Checking user: ${EMAIL_TO_CLEAR}`);

    // Find user
    const user = await db.oneOrNone(
      `SELECT * FROM users WHERE email = $1`,
      [EMAIL_TO_CLEAR]
    );

    if (!user) {
      console.log('❌ User not found in database');
      return;
    }

    console.log(`✅ Found user: ${user.user_id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Created: ${user.created_at}`);

    // Check existing trial tokens
    const tokens = await db.any(
      `SELECT * FROM free_trial_tokens WHERE user_id = $1`,
      [user.user_id]
    );

    console.log(`\n📋 Found ${tokens.length} trial token(s):`);
    tokens.forEach((token: any) => {
      console.log(`   - Status: ${token.status}, Reports: ${token.reports_remaining}, Expires: ${token.expires_at}`);
    });

    // Check device fingerprints
    const fingerprints = await db.any(
      `SELECT * FROM device_fingerprints WHERE user_id = $1`,
      [user.user_id]
    );

    console.log(`\n🖐️  Found ${fingerprints.length} device fingerprint(s):`);
    fingerprints.forEach((fp: any) => {
      console.log(`   - Trial count: ${fp.trial_count}, Blocked: ${fp.is_blocked}`);
    });

    // Check fraud flags
    const flags = await db.any(
      `SELECT * FROM trial_fraud_flags WHERE user_id = $1`,
      [user.user_id]
    );

    console.log(`\n🚩 Found ${flags.length} fraud flag(s):`);
    flags.forEach((flag: any) => {
      console.log(`   - Type: ${flag.flag_type}, Severity: ${flag.severity}, Score: ${flag.fraud_score}`);
    });

    // Clear everything
    console.log(`\n🧹 Clearing trial data for ${EMAIL_TO_CLEAR}...`);

    // Delete trial tokens
    await db.none(
      `DELETE FROM free_trial_tokens WHERE user_id = $1`,
      [user.user_id]
    );
    console.log('✅ Deleted trial tokens');

    // Reset device fingerprints
    await db.none(
      `UPDATE device_fingerprints
       SET trial_count = 0, is_blocked = false, blocked_reason = NULL
       WHERE user_id = $1`,
      [user.user_id]
    );
    console.log('✅ Reset device fingerprints');

    // Delete fraud flags
    await db.none(
      `DELETE FROM trial_fraud_flags WHERE user_id = $1`,
      [user.user_id]
    );
    console.log('✅ Deleted fraud flags');

    // Optionally delete the user entirely (uncomment if needed)
    // await db.none(`DELETE FROM users WHERE user_id = $1`, [user.user_id]);
    // console.log('✅ Deleted user account');

    console.log(`\n✅ SUCCESS! ${EMAIL_TO_CLEAR} can now activate a free trial again!`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

clearUserTrial();
