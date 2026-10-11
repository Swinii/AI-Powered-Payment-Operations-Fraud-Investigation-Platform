const { pool } = require('../src/db');
const transactionModel = require('../models/transaction.model');
const merchantModel = require('../models/merchant.model');

/**
 * Gathers complete transaction details, merchant historical baseline,
 * and velocity signals to build an evidence package for the AI Fraud Agent.
 */
async function gatherInvestigationContext(transactionId) {
  const transaction = await transactionModel.findTransactionById(transactionId);
  if (!transaction) {
    const error = new Error('transaction not found');
    error.statusCode = 404;
    throw error;
  }

  const merchant = transaction.merchant_id
    ? await merchantModel.findMerchantById(transaction.merchant_id)
    : null;

  const txAmount = Number.parseFloat(transaction.amount);
  const txCreatedAt = new Date(transaction.created_at);

  let baseline = {
    total_transactions: 0,
    successful_transactions: 0,
    failed_transactions: 0,
    lifetime_volume: 0,
    avg_transaction_amount: 0,
    max_transaction_amount: 0,
    failure_rate_percent: 0,
    merchant_age_days: 0
  };

  let velocity = {
    tx_count_last_10m: 0,
    tx_count_last_1h: 0,
    tx_count_last_24h: 0,
    volume_last_1h: 0,
    volume_last_24h: 0,
    failed_count_last_1h: 0,
    repeat_amount_count_last_1h: 0
  };

  if (merchant) {
    const merchantCreatedAt = new Date(merchant.created_at);
    const ageDays = Math.max(0, Math.floor((txCreatedAt - merchantCreatedAt) / (1000 * 60 * 60 * 24)));

    // 1. Merchant lifetime baseline
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) AS total_tx,
         COUNT(*) FILTER (WHERE status = 'success') AS success_tx,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed_tx,
         COALESCE(SUM(amount), 0) AS lifetime_volume,
         COALESCE(AVG(amount), 0) AS avg_amount,
         COALESCE(MAX(amount), 0) AS max_amount
       FROM transactions
       WHERE merchant_id = $1 AND transaction_id != $2`,
      [merchant.merchant_id, transactionId]
    );

    const s = statsResult.rows[0];
    const totalTx = Number.parseInt(s.total_tx, 10);
    const failedTx = Number.parseInt(s.failed_tx, 10);
    const avgAmt = Number.parseFloat(s.avg_amount);

    baseline = {
      total_transactions: totalTx,
      successful_transactions: Number.parseInt(s.success_tx, 10),
      failed_transactions: failedTx,
      lifetime_volume: Number.parseFloat(s.lifetime_volume),
      avg_transaction_amount: Number(avgAmt.toFixed(2)),
      max_transaction_amount: Number.parseFloat(s.max_amount),
      failure_rate_percent: totalTx > 0 ? Number(((failedTx / totalTx) * 100).toFixed(1)) : 0,
      merchant_age_days: ageDays
    };

    // 2. Velocity metrics around the transaction timestamp
    const velocityResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '10 minutes' AND created_at <= $2::timestamptz) AS count_10m,
         COUNT(*) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '1 hour' AND created_at <= $2::timestamptz) AS count_1h,
         COUNT(*) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '24 hours' AND created_at <= $2::timestamptz) AS count_24h,
         COALESCE(SUM(amount) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '1 hour' AND created_at <= $2::timestamptz), 0) AS volume_1h,
         COALESCE(SUM(amount) FILTER (WHERE created_at >= $2::timestamptz - INTERVAL '24 hours' AND created_at <= $2::timestamptz), 0) AS volume_24h,
         COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= $2::timestamptz - INTERVAL '1 hour' AND created_at <= $2::timestamptz) AS failed_1h,
         COUNT(*) FILTER (WHERE amount = $3 AND created_at >= $2::timestamptz - INTERVAL '1 hour' AND created_at <= $2::timestamptz AND transaction_id != $4) AS repeat_amt_1h
       FROM transactions
       WHERE merchant_id = $1`,
      [merchant.merchant_id, txCreatedAt.toISOString(), txAmount, transactionId]
    );

    const v = velocityResult.rows[0];
    velocity = {
      tx_count_last_10m: Number.parseInt(v.count_10m, 10),
      tx_count_last_1h: Number.parseInt(v.count_1h, 10),
      tx_count_last_24h: Number.parseInt(v.count_24h, 10),
      volume_last_1h: Number.parseFloat(v.volume_1h),
      volume_last_24h: Number.parseFloat(v.volume_24h),
      failed_count_last_1h: Number.parseInt(v.failed_1h, 10),
      repeat_amount_count_last_1h: Number.parseInt(v.repeat_amt_1h, 10)
    };
  }

  // 3. Risk flags & deviations
  const amountToAvgRatio = baseline.avg_transaction_amount > 0
    ? Number((txAmount / baseline.avg_transaction_amount).toFixed(2))
    : 1.0;

  const heuristicTriggers = [];
  if (amountToAvgRatio >= 3.5) {
    heuristicTriggers.push(`Transaction amount is ${amountToAvgRatio}x higher than merchant average`);
  }
  if (txAmount > 50000) {
    heuristicTriggers.push('Transaction amount exceeds high-value threshold (50,000)');
  }
  if (velocity.tx_count_last_10m >= 3) {
    heuristicTriggers.push(`Velocity spike: ${velocity.tx_count_last_10m} transactions in last 10 minutes`);
  }
  if (velocity.failed_count_last_1h >= 2) {
    heuristicTriggers.push(`Card testing / brute-force signal: ${velocity.failed_count_last_1h} failed transactions in last hour`);
  }
  if (velocity.repeat_amount_count_last_1h >= 2) {
    heuristicTriggers.push(`Repetitive billing pattern: ${velocity.repeat_amount_count_last_1h} identical amount transactions in last hour`);
  }
  if (transaction.payment_method === 'crypto') {
    heuristicTriggers.push('High-risk irreversible payment method (crypto)');
  }
  if (baseline.total_transactions <= 1) {
    heuristicTriggers.push('Limited or zero transaction history for merchant');
  }
  if (merchant && baseline.merchant_age_days <= 3) {
    heuristicTriggers.push(`New merchant onboarding risk: account created only ${baseline.merchant_age_days} day(s) ago`);
  }

  return {
    transaction: {
      transaction_id: transaction.transaction_id,
      amount: txAmount,
      currency: transaction.currency || 'INR',
      payment_method: transaction.payment_method || 'unknown',
      status: transaction.status,
      created_at: transaction.created_at
    },
    merchant: merchant ? {
      merchant_id: merchant.merchant_id,
      name: merchant.name,
      email: merchant.email,
      vpa_id: merchant.vpa_id,
      created_at: merchant.created_at
    } : null,
    baseline,
    velocity,
    analysis: {
      amount_to_avg_ratio: amountToAvgRatio,
      heuristic_triggers: heuristicTriggers
    }
  };
}

module.exports = { gatherInvestigationContext };
