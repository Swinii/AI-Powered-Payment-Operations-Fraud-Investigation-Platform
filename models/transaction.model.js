const { pool } = require('../src/db');

async function createTransaction({ merchantId, amount, paymentMethod, status }) {
  const result = await pool.query(
    `INSERT INTO transactions (merchant_id, amount, payment_method, status)
     VALUES ($1, $2, $3, $4)
     RETURNING transaction_id, merchant_id, amount, payment_method, status, created_at`,
    [merchantId, amount, paymentMethod, status]
  );
  return result.rows[0];
}

async function findTransactionById(transactionId) {
    console.log(`Fetching transaction with ID: ${transactionId}`);
  const result = await pool.query(
    `SELECT transaction_id, merchant_id, amount, payment_method, status, created_at
     FROM transactions WHERE transaction_id = $1`,
    [transactionId]
  );
  if (!result.rows[0]) {
    console.log(`Transaction with ID: ${transactionId} not found`);
  }
  return result.rows[0] || null;
}

async function findTransactionsByMerchant(merchantId, limit) {
  const result = await pool.query(
    `SELECT transaction_id, merchant_id, amount, payment_method, status, created_at
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
