-- Migration: Create subscription tables
-- Description: Tables for tracking user subscriptions and usage

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  subscription_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  plan_type VARCHAR(50) NOT NULL, -- 'freeTrial', 'monthly', 'yearly'
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'cancelled', 'expired', 'past_due'
  reports_used INT DEFAULT 0,
  reports_limit INT, -- 3 for free trial, NULL for unlimited
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_user_subscription UNIQUE (user_id, status)
);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);

-- Create index on stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);

-- Create index on stripe_subscription_id
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription ON user_subscriptions(stripe_subscription_id);

-- Create subscription history table for audit trail
CREATE TABLE IF NOT EXISTS subscription_history (
  history_id SERIAL PRIMARY KEY,
  subscription_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL, -- 'created', 'updated', 'cancelled', 'expired', 'payment_succeeded', 'payment_failed'
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(subscription_id) ON DELETE CASCADE
);

-- Create index on subscription_id for history lookups
CREATE INDEX IF NOT EXISTS idx_subscription_history_subscription_id ON subscription_history(subscription_id);

-- Create index on user_id for user history
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON subscription_history(user_id);

-- Create payment verifications table (if not exists from previous migration)
CREATE TABLE IF NOT EXISTS payment_verifications (
  verification_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  card_fingerprint VARCHAR(255),
  card_last4 VARCHAR(4),
  card_brand VARCHAR(50),
  verification_status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'pending'
  stripe_payment_method_id VARCHAR(255),
  amount_cents INT NOT NULL,
  verification_date TIMESTAMP DEFAULT NOW(),
  failure_reason TEXT,
  reuse_count INT DEFAULT 0
);

-- Create index on user_id for payment verifications
CREATE INDEX IF NOT EXISTS idx_payment_verifications_user_id ON payment_verifications(user_id);

-- Create index on card_fingerprint
CREATE INDEX IF NOT EXISTS idx_payment_verifications_card_fingerprint ON payment_verifications(card_fingerprint);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust based on your database user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_db_user;

-- Insert comment for documentation
COMMENT ON TABLE user_subscriptions IS 'Stores user subscription information including Stripe details and usage tracking';
COMMENT ON TABLE subscription_history IS 'Audit trail for subscription changes and events';
COMMENT ON TABLE payment_verifications IS 'Tracks payment method verifications for free trial activation';
