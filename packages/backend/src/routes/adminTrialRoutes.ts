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

export default router;
