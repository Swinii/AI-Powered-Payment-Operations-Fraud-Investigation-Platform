const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * AI Fraud Investigation Agent
 * Evaluates payment transaction anomalies using Google Gemini AI,
 * with an intelligent rule-based expert heuristic fallback engine.
 */

const SYSTEM_PROMPT = `
You are a Principal Payment Operations & AML/Fraud Investigation AI Agent for a banking platform.
Your objective is to investigate payment transactions, detect anomalies, uncover fraud patterns (card testing, velocity attacks, merchant compromise, structuring), and render a risk assessment with actionable operational recommendations.

Evaluate the provided evidence context:
- Target transaction details (amount, payment method, currency, status)
- Merchant lifetime profile and baseline (average ticket size, volume, failure rate, account age)
- Recent velocity signals (10-minute, 1-hour, 24-hour volume and frequency, failed transaction bursts)
- Observable heuristic red flags

You must respond with valid JSON matching this exact schema:
{
  "risk_score": <integer from 0 to 100>,
  "risk_level": <"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">,
  "recommended_action": <"APPROVE" | "FLAG_FOR_REVIEW" | "DECLINE" | "FREEZE_MERCHANT">,
  "confidence_score": <number between 0.00 and 1.00>,
  "investigation_summary": <string: 2-4 concise sentences detailing the core rationale, evidence evaluated, and decision justification>,
  "risk_factors": [<string: list of specific anomalies and red flags observed>],
  "suggested_next_steps": [<string: operational actions for the fraud/ops analyst>]
}

Decision guidelines:
- LOW (0-29): Expected transaction aligning with merchant baseline and normal velocity. Recommended: "APPROVE".
- MEDIUM (30-69): Moderate anomaly (e.g., mild ticket size deviation, minor velocity increase). Recommended: "APPROVE" or "FLAG_FOR_REVIEW".
- HIGH (70-89): Severe deviation (e.g., 3.5x+ ticket size spike, rapid repeat charges, card testing burst). Recommended: "FLAG_FOR_REVIEW" or "DECLINE".
- CRITICAL (90-100): Clear fraud pattern, massive abnormal spike, repeated critical failures, or compromised merchant behavior. Recommended: "DECLINE" or "FREEZE_MERCHANT".
`;

async function investigateWithGemini(context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    });

    const prompt = `${SYSTEM_PROMPT}\n\nTransaction & Merchant Evidence Context:\n${JSON.stringify(context, null, 2)}`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const parsed = JSON.parse(responseText);
    return {
      riskScore: Math.min(100, Math.max(0, Math.round(parsed.risk_score))),
      riskLevel: parsed.risk_level || 'MEDIUM',
      recommendedAction: parsed.recommended_action || 'FLAG_FOR_REVIEW',
      confidenceScore: Number(Number.parseFloat(parsed.confidence_score || 0.85).toFixed(2)),
      investigationSummary: parsed.investigation_summary || 'Transaction reviewed by AI agent.',
      riskFactors: Array.isArray(parsed.risk_factors) ? parsed.risk_factors : [],
      suggestedNextSteps: Array.isArray(parsed.suggested_next_steps) ? parsed.suggested_next_steps : [],
      investigatedBy: 'gemini_ai'
    };
  } catch (error) {
    console.warn('Gemini AI investigation encountered an issue; falling back to heuristic agent:', error.message);
    return null;
  }
}

/**
 * Intelligent Rule & Anomaly Heuristic Fallback Engine
 * Produces structured assessments based on quantitative deviation scores.
 */
function investigateWithHeuristics(context) {
  const { transaction, baseline, velocity, analysis } = context;
  const riskFactors = [];
  const suggestedNextSteps = [];
  let score = 5; // Baseline noise

  // 1. Amount deviation
  const ratio = analysis.amount_to_avg_ratio || 1;
  if (ratio >= 6.0) {
    score += 40;
    riskFactors.push(`Transaction amount is ${ratio}x higher than merchant average baseline`);
  } else if (ratio >= 3.5) {
    score += 25;
    riskFactors.push(`Transaction amount is ${ratio}x higher than typical ticket size`);
  } else if (ratio >= 2.0) {
    score += 12;
    riskFactors.push(`Transaction amount is moderately elevated (${ratio}x average)`);
  }

  // 2. High absolute value
  if (transaction.amount >= 100000) {
    score += 30;
    riskFactors.push(`Large absolute amount (${transaction.amount} ${transaction.currency})`);
  } else if (transaction.amount >= 50000) {
    score += 15;
    riskFactors.push(`High-value transaction (${transaction.amount} ${transaction.currency})`);
  }

  // 3. Velocity spikes
  if (velocity.tx_count_last_10m >= 5) {
    score += 35;
    riskFactors.push(`High-frequency velocity surge: ${velocity.tx_count_last_10m} transactions in 10 minutes`);
  } else if (velocity.tx_count_last_10m >= 3) {
    score += 20;
    riskFactors.push(`Elevated velocity: ${velocity.tx_count_last_10m} transactions in 10 minutes`);
  }

  // 4. Failed transactions burst (Card testing / brute force)
  if (velocity.failed_count_last_1h >= 3) {
    score += 30;
    riskFactors.push(`Card testing pattern: ${velocity.failed_count_last_1h} failed transactions within past hour`);
  } else if (velocity.failed_count_last_1h >= 1) {
    score += 10;
    riskFactors.push(`Preceding failure detected in past hour`);
  }

  // 5. Repetitive transaction amounts
  if (velocity.repeat_amount_count_last_1h >= 3) {
    score += 25;
    riskFactors.push(`Suspicious repetitive billing: ${velocity.repeat_amount_count_last_1h} identical amount transactions in 1 hour`);
  } else if (velocity.repeat_amount_count_last_1h >= 1) {
    score += 10;
    riskFactors.push(`Duplicate amount transaction detected recently`);
  }

  // 6. Payment method risk
  if (transaction.payment_method === 'crypto') {
    score += 18;
    riskFactors.push('High-risk payment rail: crypto');
  }

  // 7. Merchant profile maturity
  if (context.merchant && baseline.merchant_age_days <= 3 && transaction.amount >= 20000) {
    score += 20;
    riskFactors.push('Substantial volume on freshly onboarded merchant account');
  }

  if (transaction.status === 'failed') {
    score += 8;
    riskFactors.push('Current transaction status is failed');
  }

  const riskScore = Math.min(100, Math.max(0, score));

  let riskLevel = 'LOW';
  let recommendedAction = 'APPROVE';
  let confidenceScore = 0.88;

  if (riskScore >= 90) {
    riskLevel = 'CRITICAL';
    recommendedAction = velocity.tx_count_last_10m >= 5 || ratio >= 6.0 ? 'FREEZE_MERCHANT' : 'DECLINE';
    confidenceScore = 0.95;
    suggestedNextSteps.push('Immediately freeze merchant payouts pending manual compliance review');
    suggestedNextSteps.push('Trigger automated customer identity verification and transaction dispute hold');
    suggestedNextSteps.push('Audit IP address and device fingerprint across recent sessions');
  } else if (riskScore >= 70) {
    riskLevel = 'HIGH';
    recommendedAction = 'FLAG_FOR_REVIEW';
    confidenceScore = 0.91;
    suggestedNextSteps.push('Route case to Level 2 Fraud Analyst queue');
    suggestedNextSteps.push('Request two-factor confirmation or out-of-band authorization from customer');
    suggestedNextSteps.push('Monitor merchant volume over the next 24 hours');
  } else if (riskScore >= 35) {
    riskLevel = 'MEDIUM';
    recommendedAction = 'FLAG_FOR_REVIEW';
    confidenceScore = 0.85;
    suggestedNextSteps.push('Flag transaction for routine fraud operations audit');
    suggestedNextSteps.push('Verify matching VPA and billing details');
  } else {
    riskLevel = 'LOW';
    recommendedAction = 'APPROVE';
    confidenceScore = 0.94;
    suggestedNextSteps.push('Allow transaction processing without friction');
  }

  let summary = '';
  if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
    summary = `Transaction flagged with ${riskLevel.toLowerCase()} risk (Score: ${riskScore}/100) due to significant anomalies: ${riskFactors.slice(0, 2).join(' and ')}. Recommended operational action is ${recommendedAction}.`;
  } else if (riskLevel === 'MEDIUM') {
    summary = `Transaction exhibits moderate risk (Score: ${riskScore}/100) with observable deviation (${riskFactors[0] || 'minor baseline variance'}). Recommended action is ${recommendedAction}.`;
  } else {
    summary = `Transaction verified with low risk (Score: ${riskScore}/100). Activity conforms to expected merchant baseline and payment volume patterns. Recommended action is APPROVE.`;
  }

  return {
    riskScore,
    riskLevel,
    recommendedAction,
    confidenceScore,
    investigationSummary: summary,
    riskFactors,
    suggestedNextSteps,
    investigatedBy: 'heuristic_agent'
  };
}

/**
 * Main AI Agent Investigation Entry Point
 */
async function investigateContext(context) {
  // First attempt Gemini AI if configured
  const aiResult = await investigateWithGemini(context);
  if (aiResult) {
    return aiResult;
  }

  // Fallback to intelligent deterministic heuristic agent
  return investigateWithHeuristics(context);
}

module.exports = {
  investigateContext,
  investigateWithGemini,
  investigateWithHeuristics
};
