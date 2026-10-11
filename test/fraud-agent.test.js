const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const { pool, initializeDatabase } = require('../src/db');
const merchantService = require('../services/merchant.service');
const transactionService = require('../services/transaction.service');
const fraudService = require('../services/fraud.service');

test('AI Fraud Investigation Agent Suite', async (t) => {
  await initializeDatabase();
  let testMerchant;
  let normalTx;
  let suspiciousTx;

  await t.test('1. Setup merchant for tests', async () => {
    testMerchant = await merchantService.createMerchant({
      name: `Test Merchant ${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      vpa_id: `test_${Date.now()}@upi`
    });
    assert.ok(testMerchant.merchant_id);
  });

  await t.test('2. Process baseline transaction and investigate (Expect LOW risk)', async () => {
    normalTx = await transactionService.createTransaction({
      merchant_id: testMerchant.merchant_id,
      amount: 1500.00,
      payment_method: 'credit_card',
      status: 'success'
    });
    assert.ok(normalTx.transaction_id);

    const report = await fraudService.investigateTransaction(normalTx.transaction_id, { force: true });
    assert.ok(report.investigation_id);
    assert.equal(report.risk_level, 'LOW');
    assert.equal(report.recommended_action, 'APPROVE');
    assert.ok(report.risk_score < 35);
  });

  await t.test('3. Process anomalous transaction and investigate (Expect CRITICAL/HIGH risk)', async () => {
    suspiciousTx = await transactionService.createTransaction({
      merchant_id: testMerchant.merchant_id,
      amount: 95000.00,
      payment_method: 'crypto',
      status: 'pending'
    });
    assert.ok(suspiciousTx.transaction_id);

    const report = await fraudService.investigateTransaction(suspiciousTx.transaction_id, { force: true });
    assert.ok(report.investigation_id);
    assert.ok(report.risk_score >= 70);
    assert.ok(['HIGH', 'CRITICAL'].includes(report.risk_level));
    assert.ok(['DECLINE', 'FREEZE_MERCHANT', 'FLAG_FOR_REVIEW'].includes(report.recommended_action));
    assert.ok(report.risk_factors.length > 0);
  });

  await t.test('4. Human-in-the-loop analyst review', async () => {
    const existing = await fraudService.findInvestigationByTransactionId ?
      await fraudService.findInvestigationByTransactionId(suspiciousTx.transaction_id) :
      await fraudService.investigateTransaction(suspiciousTx.transaction_id);

    const reviewed = await fraudService.reviewInvestigation(existing.investigation_id, {
      analystDecision: 'CONFIRMED_FRAUD',
      analystNotes: 'Suspicious crypto spike on freshly registered test merchant.',
      status: 'resolved'
    });
    assert.equal(reviewed.analyst_decision, 'CONFIRMED_FRAUD');
    assert.equal(reviewed.status, 'resolved');
  });

  await t.test('5. Verify fraud summaries', async () => {
    const merchantSummary = await fraudService.getMerchantFraudSummary(testMerchant.merchant_id);
    assert.ok(merchantSummary.fraud_stats);
    assert.ok(Number.parseInt(merchantSummary.fraud_stats.total_investigations, 10) >= 2);

    const globalOverview = await fraudService.getGlobalFraudOverview();
    assert.ok(globalOverview.fraud_overview);
  });

  t.after(async () => {
    await pool.end();
  });
});
