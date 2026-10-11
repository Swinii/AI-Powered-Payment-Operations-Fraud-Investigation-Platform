const { pool } = require('../src/db');

async function saveInvestigation({
  transactionId,
  merchantId,
  riskScore,
  riskLevel,
  recommendedAction,
  confidenceScore = 0.85,
  investigationSummary,
  riskFactors = [],
  evidence = {},
  suggestedNextSteps = [],
  status = 'completed',
  investigatedBy = 'ai_agent'
}) {
  const result = await pool.query(
    `INSERT INTO fraud_investigations (
       transaction_id,
       merchant_id,
       risk_score,
       risk_level,
       recommended_action,
       confidence_score,
       investigation_summary,
       risk_factors,
       evidence,
       suggested_next_steps,
       status,
       investigated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      transactionId,
      merchantId,
      riskScore,
      riskLevel,
      recommendedAction,
      confidenceScore,
      investigationSummary,
      JSON.stringify(riskFactors),
      JSON.stringify(evidence),
      JSON.stringify(suggestedNextSteps),
      status,
      investigatedBy
    ]
  );
  return result.rows[0];
}

async function findInvestigationById(investigationId) {
  const result = await pool.query(
    `SELECT fi.*, 
            t.amount AS transaction_amount,
            t.currency AS transaction_currency,
            t.payment_method AS transaction_payment_method,
            t.status AS transaction_status,
            t.created_at AS transaction_created_at,
            m.name AS merchant_name,
            m.email AS merchant_email,
            m.vpa_id AS merchant_vpa_id
     FROM fraud_investigations fi
     LEFT JOIN transactions t ON fi.transaction_id = t.transaction_id
     LEFT JOIN merchants m ON fi.merchant_id = m.merchant_id
     WHERE fi.investigation_id = $1`,
    [investigationId]
  );
  return result.rows[0] || null;
}

async function findInvestigationByTransactionId(transactionId) {
  const result = await pool.query(
    `SELECT * FROM fraud_investigations
     WHERE transaction_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [transactionId]
  );
  return result.rows[0] || null;
}

async function findAllInvestigations({ riskLevel, status, merchantId, limit = 20, offset = 0 } = {}) {
  const conditions = [];
  const params = [];

  if (riskLevel) {
    params.push(riskLevel.toUpperCase());
    conditions.push(`fi.risk_level = $${params.length}`);
  }

  if (status) {
    params.push(status.toLowerCase());
    conditions.push(`fi.status = $${params.length}`);
  }

  if (merchantId) {
    params.push(merchantId);
    conditions.push(`fi.merchant_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitIndex = params.length;
  params.push(offset);
  const offsetIndex = params.length;

  const query = `
    SELECT fi.*,
           t.amount AS transaction_amount,
           t.currency AS transaction_currency,
           t.payment_method AS transaction_payment_method,
           t.status AS transaction_status,
           m.name AS merchant_name
    FROM fraud_investigations fi
    LEFT JOIN transactions t ON fi.transaction_id = t.transaction_id
    LEFT JOIN merchants m ON fi.merchant_id = m.merchant_id
    ${whereClause}
    ORDER BY fi.created_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

async function countInvestigations({ riskLevel, status, merchantId } = {}) {
  const conditions = [];
  const params = [];

  if (riskLevel) {
    params.push(riskLevel.toUpperCase());
    conditions.push(`risk_level = $${params.length}`);
  }

  if (status) {
    params.push(status.toLowerCase());
    conditions.push(`status = $${params.length}`);
  }

  if (merchantId) {
    params.push(merchantId);
    conditions.push(`merchant_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(`SELECT COUNT(*) AS total FROM fraud_investigations ${whereClause}`, params);
  return Number.parseInt(result.rows[0].total, 10);
}

async function updateAnalystReview(investigationId, { analystDecision, analystNotes, status = 'resolved' }) {
  const result = await pool.query(
    `UPDATE fraud_investigations
     SET analyst_decision = $1,
         analyst_notes = $2,
         status = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE investigation_id = $4
     RETURNING *`,
    [analystDecision, analystNotes, status, investigationId]
  );
  return result.rows[0] || null;
}

async function updateTransactionFraudStatus(transactionId, { fraudStatus, riskScore }) {
  const result = await pool.query(
    `UPDATE transactions
     SET fraud_status = $1,
         risk_score = $2
     WHERE transaction_id = $3
     RETURNING transaction_id, fraud_status, risk_score`,
    [fraudStatus, riskScore, transactionId]
  );
  return result.rows[0] || null;
}

async function getMerchantFraudStats(merchantId) {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS total_investigations,
       COUNT(*) FILTER (WHERE risk_level = 'CRITICAL') AS critical_count,
       COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS high_count,
       COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') AS medium_count,
       COUNT(*) FILTER (WHERE risk_level = 'LOW') AS low_count,
       ROUND(AVG(risk_score), 1) AS average_risk_score,
       COUNT(*) FILTER (WHERE recommended_action = 'FREEZE_MERCHANT') AS freeze_recommendations,
       COUNT(*) FILTER (WHERE analyst_decision = 'CONFIRMED_FRAUD') AS confirmed_fraud_count
     FROM fraud_investigations
     WHERE merchant_id = $1`,
    [merchantId]
  );
  return result.rows[0] || {
    total_investigations: '0',
    critical_count: '0',
    high_count: '0',
    medium_count: '0',
    low_count: '0',
    average_risk_score: '0',
    freeze_recommendations: '0',
    confirmed_fraud_count: '0'
  };
}

async function getGlobalFraudStats() {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS total_investigations,
       COUNT(*) FILTER (WHERE risk_level = 'CRITICAL') AS critical_count,
       COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS high_count,
       COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') AS medium_count,
       COUNT(*) FILTER (WHERE risk_level = 'LOW') AS low_count,
       ROUND(AVG(risk_score), 1) AS average_risk_score,
       COUNT(*) FILTER (WHERE status = 'pending_analyst_review') AS pending_review_count,
       COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_count,
       COUNT(*) FILTER (WHERE analyst_decision = 'CONFIRMED_FRAUD') AS confirmed_fraud_count,
       COUNT(*) FILTER (WHERE analyst_decision = 'FALSE_POSITIVE') AS false_positive_count
     FROM fraud_investigations`
  );
  return result.rows[0];
}

module.exports = {
  saveInvestigation,
  findInvestigationById,
  findInvestigationByTransactionId,
  findAllInvestigations,
  countInvestigations,
  updateAnalystReview,
  updateTransactionFraudStatus,
  getMerchantFraudStats,
  getGlobalFraudStats
};
