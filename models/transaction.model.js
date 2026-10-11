const { pool } = require('../src/db');

async function createTransaction({ merchantId, amount, paymentMethod, status, currency = 'INR', fraudStatus = 'unscreened', riskScore = null }) {
  const result = await pool.query(
    `INSERT INTO transactions (merchant_id, amount, payment_method, status, currency, fraud_status, risk_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING transaction_id, merchant_id, amount, payment_method, status, currency, fraud_status, risk_score, created_at`,
    [merchantId, amount, paymentMethod, status, currency, fraudStatus, riskScore]
  );
  return result.rows[0];
}

async function findTransactionById(transactionId) {
  const result = await pool.query(
    `SELECT transaction_id, merchant_id, amount, payment_method, status, currency, fraud_status, risk_score, created_at
     FROM transactions WHERE transaction_id = $1`,
    [transactionId]
  );
  return result.rows[0] || null;
}

async function findTransactionsByMerchant(merchantId, limit) {
  const result = await pool.query(
    `SELECT transaction_id, merchant_id, amount, payment_method, status, currency, fraud_status, risk_score, created_at
     FROM transactions
     WHERE merchant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [merchantId, limit]
  );
  return result.rows;
}

async function getMerchantSummary(merchantId) {
  const result = await pool.query(
    `SELECT
       merchant_id,
       COUNT(*) AS total_transactions,
       SUM(amount) AS total_amount,
       COUNT(*) FILTER (WHERE status = 'success') AS successful_transactions,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed_transactions
     FROM transactions
     WHERE merchant_id = $1
     GROUP BY merchant_id`,
    [merchantId]
  );
  return result.rows[0] || {
    merchant_id: merchantId,
    total_transactions: '0',
    total_amount: '0.00',
    successful_transactions: '0',
    failed_transactions: '0'
  };
}

module.exports = {
  createTransaction,
  findTransactionById,
  findTransactionsByMerchant,
  getMerchantSummary
};
