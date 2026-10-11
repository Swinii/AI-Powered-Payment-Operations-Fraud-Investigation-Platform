# AI-Powered-Payment-Operations-Fraud-Investigation-Platform
A mini banking transaction-monitoring platform with an AI agent that investigates suspicious transactions.

## Features

- **Merchant & Transaction Management**: REST API with Express and PostgreSQL.
- **AI Fraud Investigation Agent**:
  - Powered by **Google Gemini AI** (with an intelligent heuristic fallback engine for offline or non-API-key execution).
  - Multi-dimensional risk feature extraction (ticket size vs merchant baseline ratio, velocity bursts in 10m/1h/24h, card-testing failure bursts, repetitive billing detection, high-risk payment rails).
  - Risk scoring (0–100), risk tiers (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), confidence metrics, and actionable operational recommendations (`APPROVE`, `FLAG_FOR_REVIEW`, `DECLINE`, `FREEZE_MERCHANT`).
  - Human-in-the-Loop analyst review workflow (`PATCH /investigations/:id/review`).
  - Automated screening for incoming high-value or high-risk transactions.
- **Caching**: Redis caching for merchant summaries with automatic cache invalidation on new transactions.
- **Resilience**: Gracefully operates even if Redis or external LLM services are temporarily offline.

## Requirements

- Node.js 18+
- PostgreSQL 14+ (or Neon serverless Postgres)
- Redis (optional, for caching)
- Google Gemini API Key (optional; set `GEMINI_API_KEY` for LLM investigations)

## Setup

1. Copy `.env.example` to `.env` (or configure your `.env`):
   ```env
   PORT=8080
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   REDIS_URL=redis://localhost:6379
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the API:
   ```bash
   npm start
   ```
   Or in development watch mode:
   ```bash
   npm run dev
   ```

The schema and tables (`merchants`, `transactions`, `fraud_investigations`) are created automatically on startup. The API listens on `http://localhost:8080`.

## API Endpoints

### Merchants
- `POST /merchants` - Create merchant `{ "name", "email", "vpa_id" }`
- `GET /merchants` - List merchants
- `GET /merchants/:id` - Get merchant details
- `DELETE /merchants/:id` - Delete merchant (transactions are preserved with `merchant_id = NULL`)
- `GET /merchants/:id/fraud-summary` - Fraud metrics and risk profile for a merchant

### Transactions
- `POST /transactions` - Create transaction `{ "merchant_id", "amount", "payment_method", "currency?", "status?" }`
- `GET /transactions/:id` - Get transaction details (includes `fraud_status` and `risk_score`)
- `GET /merchants/:id/transactions?limit=10` - List merchant transactions
- `GET /merchants/:id/transactions/summary` - Cached aggregation of transaction counts and total volume

### AI Fraud Investigation
- `POST /transactions/:id/investigate?force=true` - Trigger AI investigation on a transaction
- `GET /investigations?risk_level=HIGH&status=pending_analyst_review&limit=20` - Query investigations list
- `GET /investigations/:id` - Retrieve complete investigation report with evidence and timeline
- `PATCH /investigations/:id/review` - Analyst human-in-the-loop review `{ "analyst_decision": "CONFIRMED_FRAUD" | "FALSE_POSITIVE" | "APPROVED_OVERRIDE", "analyst_notes": "..." }`
- `GET /fraud/overview` - System-wide fraud statistics and risk breakdown

### System
- `GET /health` - Database connectivity health check
