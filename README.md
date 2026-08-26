# AI-Powered-Payment-Operations-Fraud-Investigation-Platform
Its a mini banking transaction-monitoring platform with an AI agent that investigates suspicious transactions. 

# Merchant Transaction API

Express and PostgreSQL API for managing merchants and their payment transactions.

## Requirements

- Node.js 18+
- PostgreSQL 14+

## Setup

1. Create a PostgreSQL database named `merchant_transactions`.
2. Copy `.env.example` to `.env` and update `DATABASE_URL` if needed.
	Set `REDIS_URL` to your Redis connection URL, for example `redis://localhost:6379`.
3. Install dependencies and start the API:

```bash
npm install
npm start
```

The schema is created automatically on startup. The API listens on `http://localhost:3000`.

## Endpoints

- `POST /merchants` with `{ "name", "email", "vpa_id" }`
- `GET /merchants`
- `GET /merchants/:id`
- `DELETE /merchants/:id`
- `POST /transactions` with `{ "merchant_id", "amount", "payment_method", "status?" }`
- `GET /transactions/:id`
- `GET /merchants/:id/transactions?limit=10`
- `GET /merchants/:id/transactions/summary`
- `GET /health`

Supported payment methods are `credit_card`, `bank_transfer`, `crypto`, and `digital_wallet`. Transaction status defaults to `pending`.

Deleting a merchant sets `merchant_id` to `NULL` on existing transactions, preserving transaction records.

The transaction summary endpoint runs an aggregate PostgreSQL query and caches the result in Redis for 60 seconds. Creating a new transaction invalidates that merchant's cached summary. If Redis is unavailable, the API continues using PostgreSQL without caching.
=======

