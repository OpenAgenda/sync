'use strict';

const { promisify } = require('util');

module.exports = function promisifyRedis(client) {
  const handler = {
    get(target, propKey) {
      if (typeof target[propKey] === 'function') {
        return promisify(target[propKey]).bind(target);
      }
      return target[propKey];
    },
  };

  return new Proxy(client, handler);
};
