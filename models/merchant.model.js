const { pool } = require('../src/db');

async function createMerchant({ name, email, vpaId }) {
  const result = await pool.query(
    `INSERT INTO merchants (name, email, vpa_id)
     VALUES ($1, $2, $3)
     RETURNING merchant_id, name, email, vpa_id, created_at`,
    [name, email, vpaId]
  );
  return result.rows[0];
}

async function findAllMerchants() {
  const result = await pool.query(
    'SELECT merchant_id, name, email, vpa_id, created_at FROM merchants ORDER BY created_at DESC'
  );
  return result.rows;
}

async function findMerchantById(merchantId) {
  const result = await pool.query(
    'SELECT merchant_id, name, email, vpa_id, created_at FROM merchants WHERE merchant_id = $1',
    [merchantId]
  );
  return result.rows[0] || null;
}

async function deleteMerchant(merchantId) {
  const result = await pool.query(
    'DELETE FROM merchants WHERE merchant_id = $1 RETURNING merchant_id',
    [merchantId]
  );
  return result.rows[0] || null;
}

module.exports = { createMerchant, findAllMerchants, findMerchantById, deleteMerchant };
