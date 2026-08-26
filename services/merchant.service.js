const merchantModel = require('../models/merchant.model');

function validateUuid(value, field) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')) {
    const error = new Error(`${field} must be a valid UUID`);
    error.statusCode = 400;
    throw error;
  }
}

async function createMerchant(input) {
  const { name, email, vpa_id: vpaId } = input;
  if (!name || !email || !vpaId) {
    const error = new Error('name, email, and vpa_id are required');
    error.statusCode = 400;
    throw error;
  }

  try {
    return await merchantModel.createMerchant({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      vpaId: vpaId.trim()
    });
  } catch (error) {
    if (error.code === '23505') {
      const conflict = new Error('merchant already exists');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

async function listMerchants() {
  return merchantModel.findAllMerchants();
}

async function getMerchant(merchantId) {
  validateUuid(merchantId, 'merchant id');
  const merchant = await merchantModel.findMerchantById(merchantId);
  if (!merchant) {
    const error = new Error('merchant not found');
    error.statusCode = 404;
    throw error;
  }
  return merchant;
}

async function removeMerchant(merchantId) {
  validateUuid(merchantId, 'merchant id');
  const merchant = await merchantModel.deleteMerchant(merchantId);
  if (!merchant) {
    const error = new Error('merchant not found');
    error.statusCode = 404;
    throw error;
  }
}

module.exports = { createMerchant, listMerchants, getMerchant, removeMerchant, validateUuid };
