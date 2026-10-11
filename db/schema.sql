CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS merchants (
    merchant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    vpa_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS vpa_id VARCHAR(255);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID REFERENCES merchants(merchant_id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    fraud_status VARCHAR(30) NOT NULL DEFAULT 'unscreened',
    risk_score INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'INR';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fraud_status VARCHAR(30) NOT NULL DEFAULT 'unscreened';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS risk_score INT;

CREATE INDEX IF NOT EXISTS idx_transactions_merchant_date
    ON transactions (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_fraud_status
    ON transactions (fraud_status, created_at DESC);

-- Fraud investigations table
CREATE TABLE IF NOT EXISTS fraud_investigations (
    investigation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    merchant_id UUID REFERENCES merchants(merchant_id) ON DELETE SET NULL,
    risk_score INT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_level VARCHAR(20) NOT NULL,
    recommended_action VARCHAR(50) NOT NULL,
    confidence_score NUMERIC(4, 2) NOT NULL DEFAULT 0.85,
    investigation_summary TEXT NOT NULL,
    risk_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    suggested_next_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'completed',
    analyst_decision VARCHAR(50),
    analyst_notes TEXT,
    investigated_by VARCHAR(50) NOT NULL DEFAULT 'ai_agent',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investigations_transaction
    ON fraud_investigations (transaction_id);

CREATE INDEX IF NOT EXISTS idx_investigations_merchant
    ON fraud_investigations (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_investigations_risk
    ON fraud_investigations (risk_level, status);