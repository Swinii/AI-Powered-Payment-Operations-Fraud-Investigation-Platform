const transactionModel = require('../models/transaction.model');
const merchantModel = require('../models/merchant.model');
const { validateUuid } = require('./merchant.service');
const { redisClient } = require('../src/redis');

function summaryCacheKey(merchantId) {
  return `merchant:${merchantId}:transaction-summary`;
}

async function readSummaryCache(merchantId) {
  if (!redisClient.isReady) {
    console.warn('Redis client is not ready. Skipping cache read.');
    return null;
  }
  console.log(`-----readSummary-------Fetching summary from cache for merchant with ID: ${merchantId}`);
  const cached = await redisClient.get(summaryCacheKey(merchantId));
  console.log("summaryCasheKey: ", summaryCacheKey(merchantId));
  console.log(`Retrieved summary from cache for merchant with ID: ${merchantId}, cached: ${cached}`);
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
  const { merchant_id: merchantId, amount, payment_method: paymentMethod, status = 'pending' } = input;
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

  const transaction = await transactionModel.createTransaction({ merchantId, amount, paymentMethod, status });
  await clearSummaryCache(merchantId);
  return transaction;
}

async function getTransaction(transactionId) {
  validateUuid(transactionId, 'transaction id');
  console.log(`Fetching transaction with ID: ${transactionId}`);
  const transaction = await transactionModel.findTransactionById(transactionId);
  if (!transaction) {
    console.log(`Transaction with ID: ${transactionId} not found`);
    const error = new Error('transaction not found');
    error.statusCode = 404;
    throw error;
  }
  return transaction;
}

async function listMerchantTransactions(merchantId, requestedLimit) {
  validateUuid(merchantId, 'merchant id');
  console.log(`Fetching transactions for merchant with ID: ${merchantId}`);
  const limit = Math.min(Math.max(Number(requestedLimit) || 10, 1), 100);
  return transactionModel.findTransactionsByMerchant(merchantId, limit);
}

async function getMerchantSummary(merchantId) {
  validateUuid(merchantId, 'merchant id');
  console.log(`----getMerchantSummary---check merchant ID: ${merchantId}`);
  const merchant = await merchantModel.findMerchantById(merchantId);
  if (!merchant) {
    console.log(`Merchant with ID: ${merchantId} not found`);
    const error = new Error('merchant not found');
    error.statusCode = 404;
    throw error;
  }

  try {
    console.log(`Fetching summary from cache for merchant with ID: ${merchantId}`);
    const cached = await readSummaryCache(merchantId);
    if (cached) {
      console.log(`Retrieved summary from cache for merchant with ID: ${merchantId}`);
      return cached;
    }
    console.log(`Summary not found in cache for merchant with ID: ${merchantId}`);
    const summary = await transactionModel.getMerchantSummary(merchantId);
    await writeSummaryCache(merchantId, summary);
    console.log(`Written summary to cache for merchant with ID: ${merchantId}, summary: ${JSON
        .stringify(summary)
    }  `);
    return summary;
  } catch (error) {
    console.error('Redis summary cache error:', error.message);
    return transactionModel.getMerchantSummary(merchantId);
  }
}

module.exports = { createTransaction, getTransaction, listMerchantTransactions, getMerchantSummary };
