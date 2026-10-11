const fraudModel = require('../models/fraud.model');
const merchantModel = require('../models/merchant.model');
const { validateUuid } = require('./merchant.service');
const { gatherInvestigationContext } = require('./fraudContext.service');
const { investigateContext } = require('./aiAgent.service');

function mapScoreToFraudStatus(riskScore, recommendedAction) {
  if (recommendedAction === 'FREEZE_MERCHANT' || riskScore >= 90) return 'flagged';
  if (recommendedAction === 'DECLINE' || riskScore >= 70) return 'flagged';
  if (recommendedAction === 'FLAG_FOR_REVIEW' || riskScore >= 35) return 'suspicious';
  return 'clean';
}

async function investigateTransaction(transactionId, { force = false } = {}) {
  validateUuid(transactionId, 'transaction id');

  if (!force) {
    const existing = await fraudModel.findInvestigationByTransactionId(transactionId);
    if (existing) {
      return existing;
    }
  }

  // 1. Gather context & historical evidence
  const context = await gatherInvestigationContext(transactionId);

  // 2. Execute AI Agent reasoning
  const aiReport = await investigateContext(context);

  const fraudStatus = mapScoreToFraudStatus(aiReport.riskScore, aiReport.recommendedAction);

  // 3. Persist investigation to DB
  const investigation = await fraudModel.saveInvestigation({
    transactionId,
    merchantId: context.merchant ? context.merchant.merchant_id : null,
    riskScore: aiReport.riskScore,
    riskLevel: aiReport.riskLevel,
    recommendedAction: aiReport.recommendedAction,
    confidenceScore: aiReport.confidenceScore,
    investigationSummary: aiReport.investigationSummary,
    riskFactors: aiReport.riskFactors,
    evidence: {
      transaction: context.transaction,
      baseline: context.baseline,
      velocity: context.velocity,
      analysis: context.analysis
    },
    suggestedNextSteps: aiReport.suggestedNextSteps,
    status: aiReport.riskScore >= 35 ? 'pending_analyst_review' : 'completed',
    investigatedBy: aiReport.investigatedBy
  });

  // 4. Update transaction table with risk score & fraud status
  await fraudModel.updateTransactionFraudStatus(transactionId, {
    fraudStatus,
    riskScore: aiReport.riskScore
  });

  return investigation;
}

async function getInvestigation(investigationId) {
  validateUuid(investigationId, 'investigation id');
  const investigation = await fraudModel.findInvestigationById(investigationId);
  if (!investigation) {
    const error = new Error('investigation not found');
    error.statusCode = 404;
    throw error;
  }
  return investigation;
}

async function listInvestigations({ riskLevel, status, merchantId, limit = 20, offset = 0 } = {}) {
  const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const parsedOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);

  if (merchantId) {
    validateUuid(merchantId, 'merchant id');
  }

  const [items, total] = await Promise.all([
    fraudModel.findAllInvestigations({
      riskLevel,
      status,
      merchantId,
      limit: parsedLimit,
      offset: parsedOffset
    }),
    fraudModel.countInvestigations({
      riskLevel,
      status,
      merchantId
    })
  ]);

  return {
    data: items,
    pagination: {
      total,
      limit: parsedLimit,
      offset: parsedOffset,
      has_more: parsedOffset + items.length < total
    }
  };
}

async function reviewInvestigation(investigationId, { analystDecision, analystNotes, status = 'resolved' }) {
  validateUuid(investigationId, 'investigation id');

  const validDecisions = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'APPROVED_OVERRIDE', 'ESCALATED'];
  if (!analystDecision || !validDecisions.includes(analystDecision.toUpperCase())) {
    const error = new Error(`analyst_decision must be one of: ${validDecisions.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const investigation = await fraudModel.findInvestigationById(investigationId);
  if (!investigation) {
    const error = new Error('investigation not found');
    error.statusCode = 404;
    throw error;
  }

  const decision = analystDecision.toUpperCase();
  const updated = await fraudModel.updateAnalystReview(investigationId, {
    analystDecision: decision,
    analystNotes: analystNotes ? analystNotes.trim() : null,
    status
  });

  // Also update corresponding transaction status if confirmed fraud or false positive
  let updatedFraudStatus = 'suspicious';
  if (decision === 'CONFIRMED_FRAUD') updatedFraudStatus = 'confirmed_fraud';
  else if (decision === 'FALSE_POSITIVE' || decision === 'APPROVED_OVERRIDE') updatedFraudStatus = 'clean';

  await fraudModel.updateTransactionFraudStatus(investigation.transaction_id, {
    fraudStatus: updatedFraudStatus,
    riskScore: investigation.risk_score
  });

  return updated;
}

async function getMerchantFraudSummary(merchantId) {
  validateUuid(merchantId, 'merchant id');
  const merchant = await merchantModel.findMerchantById(merchantId);
  if (!merchant) {
    const error = new Error('merchant not found');
    error.statusCode = 404;
    throw error;
  }

  const stats = await fraudModel.getMerchantFraudStats(merchantId);
  return {
    merchant_id: merchantId,
    merchant_name: merchant.name,
    fraud_stats: stats
  };
}

async function getGlobalFraudOverview() {
  const stats = await fraudModel.getGlobalFraudStats();
  return {
    fraud_overview: stats
  };
}

/**
 * Automatically screens a transaction upon creation
 */
async function autoScreenTransaction(transaction) {
  try {
    const amount = Number.parseFloat(transaction.amount);
    // Automatic trigger conditions
    const shouldAutoInvestigate =
      amount >= 10000 ||
      transaction.payment_method === 'crypto' ||
      transaction.status === 'failed';

    if (shouldAutoInvestigate) {
      // Run investigation asynchronously so transaction creation isn't blocked
      investigateTransaction(transaction.transaction_id).catch(err => {
        console.error('Auto-investigation background error:', err.message);
      });
    }
  } catch (err) {
    console.error('Error during auto-screening evaluation:', err.message);
  }
}

module.exports = {
  investigateTransaction,
  getInvestigation,
  listInvestigations,
  reviewInvestigation,
  getMerchantFraudSummary,
  getGlobalFraudOverview,
  autoScreenTransaction
};
