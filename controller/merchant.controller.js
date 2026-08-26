const merchantService = require('../services/merchant.service');

async function create(request, response, next) {
  try {
    const merchant = await merchantService.createMerchant(request.body);
    response.status(201).json(merchant);
  } catch (error) {
    next(error);
  }
}

async function list(_request, response, next) {
  try {
    response.json(await merchantService.listMerchants());
  } catch (error) {
    next(error);
  }
}

async function getById(request, response, next) {
  try {
    response.json(await merchantService.getMerchant(request.params.id));
  } catch (error) {
    next(error);
  }
}

async function remove(request, response, next) {
  try {
    await merchantService.removeMerchant(request.params.id);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = { create, list, getById, remove };
