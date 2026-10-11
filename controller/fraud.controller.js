const fraudService = require('../services/fraud.service');

async function investigate(request, response, next) {
  try {
    const force = request.query.force === 'true';
    const investigation = await fraudService.investigateTransaction(request.params.id, { force });
    response.status(200).json(investigation);
  } catch (error) {
    next(error);
  }
}

async function getById(request, response, next) {
  try {
    const investigation = await fraudService.getInvestigation(request.params.id);
    response.status(200).json(investigation);
  } catch (error) {
    next(error);
  }
}

async function list(request, response, next) {
  try {
    const { risk_level: riskLevel, status, merchant_id: merchantId, limit, offset } = request.query;
    const result = await fraudService.listInvestigations({ riskLevel, status, merchantId, limit, offset });
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function review(request, response, next) {
  try {
    const { analyst_decision: analystDecision, analyst_notes: analystNotes, status } = request.body;
    const updated = await fraudService.reviewInvestigation(request.params.id, {
      analystDecision,
      analystNotes,
      status
    });
    response.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

async function getMerchantSummary(request, response, next) {
  try {
    const summary = await fraudService.getMerchantFraudSummary(request.params.id);
    response.status(200).json(summary);
  } catch (error) {
    next(error);
  }
}

async function getOverview(_request, response, next) {
  try {
    const overview = await fraudService.getGlobalFraudOverview();
    response.status(200).json(overview);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  investigate,
  getById,
  list,
  review,
  getMerchantSummary,
  getOverview
};
