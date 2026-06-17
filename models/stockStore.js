'use strict';

/*
 * Almacén simple en memoria para los likes de cada acción.
 * Estructura: { SYMBOL: Set(hashedIp1, hashedIp2, ...) }
 *
 * No usamos una base de datos externa porque el desafío no la exige;
 * basta con persistir los likes durante la vida del proceso del servidor.
 * Si se requiere persistencia entre reinicios, esto se puede sustituir
 * fácilmente por una colección de MongoDB sin cambiar la interfaz pública.
 */

const stockLikes = new Map();

function getLikesSet(symbol) {
  const key = symbol.toUpperCase();
  if (!stockLikes.has(key)) {
    stockLikes.set(key, new Set());
  }
  return stockLikes.get(key);
}

function getLikeCount(symbol) {
  return getLikesSet(symbol).size;
}

function addLike(symbol, anonymizedIp) {
  const set = getLikesSet(symbol);
  set.add(anonymizedIp);
  return set.size;
}

function hasLiked(symbol, anonymizedIp) {
  return getLikesSet(symbol).has(anonymizedIp);
}

module.exports = {
  getLikeCount,
  addLike,
  hasLiked,
};
