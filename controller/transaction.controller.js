const transactionService = require('../services/transaction.service');

async function create(request, response, next) {
  try {
    const transaction = await transactionService.createTransaction(request.body);
    response.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
}

async function getById(request, response, next) {
  try {
    console.log(`Fetching transaction with ID: ${request.params.id}`);
    response.json(await transactionService.getTransaction(request.params.id));
  } catch (error) {
    next(error);
  }
}

async function listByMerchant(request, response, next) {
  try {
    response.json(await transactionService.listMerchantTransactions(request.params.id, request.query.limit));
  } catch (error) {
    next(error);
  }
}

async function summaryByMerchant(request, response, next) {
  try {
    response.json(await transactionService.getMerchantSummary(request.params.id));
  } catch (error) {
    next(error);
  }
}

module.exports = { create, getById, listByMerchant, summaryByMerchant };
