'use strict';

const crypto = require('crypto');
const https = require('https');
const stockStore = require('../models/stockStore');

const PROXY_BASE =
  'https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/';

/**
 * Anonimiza una dirección IP antes de almacenarla, cumpliendo con
 * requisitos de privacidad tipo GDPR. Usamos un hash SHA-256 con
 * una sal fija de proceso: es irreversible y suficiente para
 * deduplicar "1 like por IP" sin guardar la IP real.
 */
function anonymizeIp(ip) {
  return crypto
    .createHash('sha256')
    .update(String(ip) + (process.env.IP_SALT || 'fcc-stock-checker-salt'))
    .digest('hex');
}

/**
 * Obtiene la IP real del request, considerando proxies (Render, Heroku, etc.)
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection.remoteAddress || '0.0.0.0';
}

/**
 * Llama al proxy de freeCodeCamp para obtener el precio actual de un símbolo.
 * Devuelve { symbol, price } o lanza un error si el símbolo es inválido.
 */
function fetchStockQuote(symbol) {
  return new Promise((resolve, reject) => {
    const url = `${PROXY_BASE}${encodeURIComponent(symbol)}/quote`;

    https
      .get(url, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            // El proxy devuelve { symbol, latestPrice, ... } en caso válido,
            // o un objeto sin esos campos / con error si el símbolo no existe.
            if (!data || typeof data.latestPrice !== 'number' || !data.symbol) {
              return reject(new Error('invalid symbol'));
            }
            resolve({
              symbol: data.symbol,
              price: data.latestPrice,
            });
          } catch (err) {
            reject(new Error('invalid symbol'));
          }
        });
      })
      .on('error', () => reject(new Error('proxy request failed')));
  });
}

/**
 * Construye el objeto stockData para un solo símbolo.
 */
async function buildSingleStockData(symbol, anonIp, shouldLike) {
  const quote = await fetchStockQuote(symbol);

  if (shouldLike && !stockStore.hasLiked(quote.symbol, anonIp)) {
    stockStore.addLike(quote.symbol, anonIp);
  }

  return {
    stock: quote.symbol,
    price: quote.price,
    likes: stockStore.getLikeCount(quote.symbol),
  };
}

/**
 * Construye el array stockData para dos símbolos, usando rel_likes
 * en lugar de likes absolutos.
 */
async function buildDualStockData(symbols, anonIp, shouldLike) {
  const quotes = await Promise.all(symbols.map(fetchStockQuote));

  if (shouldLike) {
    quotes.forEach((quote) => {
      if (!stockStore.hasLiked(quote.symbol, anonIp)) {
        stockStore.addLike(quote.symbol, anonIp);
      }
    });
  }

  const likeCounts = quotes.map((q) => stockStore.getLikeCount(q.symbol));

  return [
    {
      stock: quotes[0].symbol,
      price: quotes[0].price,
      rel_likes: likeCounts[0] - likeCounts[1],
    },
    {
      stock: quotes[1].symbol,
      price: quotes[1].price,
      rel_likes: likeCounts[1] - likeCounts[0],
    },
  ];
}

/**
 * Handler principal de la ruta GET /api/stock-prices
 */
async function handleStockPricesRequest(req, res) {
  try {
    const { stock, like } = req.query;
    const shouldLike = like === 'true' || like === true;

    if (!stock) {
      return res.status(400).json({ error: 'stock query parameter is required' });
    }

    const anonIp = anonymizeIp(getClientIp(req));

    // Dos acciones
    if (Array.isArray(stock)) {
      if (stock.length !== 2) {
        return res
          .status(400)
          .json({ error: 'exactly 1 or 2 stock symbols are supported' });
      }
      const stockData = await buildDualStockData(stock, anonIp, shouldLike);
      return res.json({ stockData });
    }

    // Una sola acción
    const stockData = await buildSingleStockData(stock, anonIp, shouldLike);
    return res.json({ stockData });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'invalid symbol' });
  }
}

module.exports = {
  handleStockPricesRequest,
  // Exportado para pruebas unitarias / reutilización si se necesita
  anonymizeIp,
};
