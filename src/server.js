require('dotenv').config();

const express = require('express');
const { initializeDatabase, pool } = require('./db');
const { connectRedis } = require('./redis');
const merchantController = require('../controller/merchant.controller');
const transactionController = require('../controller/transaction.controller');

const app = express();
const port = Number(process.env.PORT || 8080);

app.use(express.json());

app.get('/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.post('/merchants', merchantController.create);
app.get('/merchants', merchantController.list);
app.get('/merchants/:id', merchantController.getById);
app.delete('/merchants/:id', merchantController.remove);

app.post('/transactions', transactionController.create);
app.get('/transactions/:id', transactionController.getById);
app.get('/merchants/:id/transactions', transactionController.listByMerchant);
app.get('/merchants/:id/transactions/summary', transactionController.summaryByMerchant);

app.use((_request, response) => response.status(404).json({ error: 'route not found' }));
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.statusCode || 500).json({
    error: error.statusCode ? error.message : 'internal server error'
  });
});

async function start() {
  await initializeDatabase();
  try {
    await connectRedis();
    console.log('Redis connected');
  } catch (error) {
    console.error('Redis unavailable; continuing without cache:', error.message);
  }
  app.listen(port, () => console.log(`Merchant transaction API listening on port ${port}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start API:', error.message);
    process.exit(1);
  });
}

module.exports = app;
