-- Migration: Fix subscription unique constraint
-- Description: Allow only ONE active subscription per user, but track full history

-- Drop the problematic constraint
ALTER TABLE user_subscriptions
DROP CONSTRAINT IF EXISTS unique_user_subscription;

-- Add a better constraint: Only ONE active subscription per user
CREATE UNIQUE INDEX idx_unique_active_subscription
ON user_subscriptions (user_id)
WHERE status = 'active';

-- Add index for better performance on status queries
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status
ON user_subscriptions(status);

-- Add index for expiration date lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_period_end
ON user_subscriptions(current_period_end);

-- Add comment for documentation
COMMENT ON INDEX idx_unique_active_subscription IS 'Ensures user can only have ONE active subscription at a time, but allows tracking of cancelled/expired history';
