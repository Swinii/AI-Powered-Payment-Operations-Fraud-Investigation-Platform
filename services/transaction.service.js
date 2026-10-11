const transactionModel = require('../models/transaction.model');
const merchantModel = require('../models/merchant.model');
const { validateUuid } = require('./merchant.service');
const { redisClient } = require('../src/redis');

function summaryCacheKey(merchantId) {
  return `merchant:${merchantId}:transaction-summary`;
}

async function readSummaryCache(merchantId) {
  if (!redisClient.isReady) {
    return null;
  }
  const cached = await redisClient.get(summaryCacheKey(merchantId));
  return cached ? JSON.parse(cached) : null;
}

async function writeSummaryCache(merchantId, summary) {
  if (redisClient.isReady) {
    await redisClient.set(summaryCacheKey(merchantId), JSON.stringify(summary), { EX: 60 });
  }
}

async function clearSummaryCache(merchantId) {
  if (redisClient.isReady) {
    await redisClient.del(summaryCacheKey(merchantId));
  }
}

async function createTransaction(input) {
  const {
    merchant_id: merchantId,
    amount,
    payment_method: paymentMethod,
    status = 'pending',
    currency = 'INR'
  } = input;

  validateUuid(merchantId, 'merchant_id');
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    const error = new Error('amount must be greater than zero');
    error.statusCode = 400;
    throw error;
  }
  const merchant = await merchantModel.findMerchantById(merchantId);
  if (!merchant) {
    const error = new Error('merchant not found');
    error.statusCode = 404;
    throw error;
  }

  const transaction = await transactionModel.createTransaction({
    merchantId,
    amount,
    paymentMethod,
    status,
    currency
  });

  await clearSummaryCache(merchantId);

  // Trigger background fraud screening
  try {
    const { autoScreenTransaction } = require('./fraud.service');
    autoScreenTransaction(transaction);
  } catch (err) {
    console.error('Auto-screen trigger error:', err.message);
  }

  return transaction;
}

async function getTransaction(transactionId) {
  validateUuid(transactionId, 'transaction id');
  const transaction = await transactionModel.findTransactionById(transactionId);
  if (!transaction) {
    const error = new Error('transaction not found');
    error.statusCode = 404;
    throw error;
  }
  return transaction;
}

async function listMerchantTransactions(merchantId, requestedLimit) {
  validateUuid(merchantId, 'merchant id');
  const limit = Math.min(Math.max(Number(requestedLimit) || 10, 1), 100);
  return transactionModel.findTransactionsByMerchant(merchantId, limit);
}

async function getMerchantSummary(merchantId) {
  validateUuid(merchantId, 'merchant id');
  const merchant = await merchantModel.findMerchantById(merchantId);
  if (!merchant) {
    const error = new Error('merchant not found');
    error.statusCode = 404;
    throw error;
  }

  try {
    const cached = await readSummaryCache(merchantId);
    if (cached) {
      return cached;
    }
    const summary = await transactionModel.getMerchantSummary(merchantId);
    await writeSummaryCache(merchantId, summary);
    return summary;
  } catch (error) {
    console.error('Redis summary cache error:', error.message);
    return transactionModel.getMerchantSummary(merchantId);
  }
}

module.exports = { createTransaction, getTransaction, listMerchantTransactions, getMerchantSummary };
