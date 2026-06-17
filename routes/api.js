'use strict';

const stockController = require('../controllers/stockController');

module.exports = function (app) {

  app.route('/api/stock-prices')
    .get(stockController.handleStockPricesRequest);

};
