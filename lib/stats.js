'use strict';

const path = require('path');
const redis = require('redis');
const { Mails } = require('@openagenda/mails');
const promisifyRedis = require('../utils/promisifyRedis');

function getClient(config) {
  return promisifyRedis(redis.createClient(config));
}

async function push(params) {
  const { stats, log } = params;

  if (!params.redis) {
    log('Redis is not configured, stats not pushed');
    return;
  }

  const { client, listKey } = params.redis;

  const redisClient = getClient(client);
  const result = [];

  for (const key of [].concat(listKey)) {
    result.push(await redisClient.rpush(key, JSON.stringify(stats)));
    log(`Stats pushed on '${key}'`);
  }

  redisClient.end(true);

  return result;
}

async function get(params, listKeyOpt) {
  const { log } = params;

  if (!params.redis) {
    log('Redis is not configured, stats not pushed');
    return;
  }

  const { client } = params.redis;
  const listKey = listKeyOpt || params.redis.listKey;

  const redisClient = getClient(client);

  const length = await redisClient.llen(listKey);
  const result = (await redisClient.lrange(listKey, 0, length))
    .map(v => JSON.parse(v));

  await redisClient.ltrim(listKey, 1, 0);

  redisClient.end(true);

  return result;
}

async function sendReport(params) {
  const { log } = params;

  if (typeof params.sendTo !== 'object' || params.sendTo === null) {
    return;
  }

  if (!params.redis) {
    log('Redis is not configured, impossible to send report');
    return;
  }

  if (!params.mails) {
    log('@openagenda/mails is not configured, impossible to send report');
    return;
  }

  const mails = new Mails({
    templatesDir: path.join(__dirname, 'templates'),
    ...params.mails
  });

  await mails.init();

  const entries = Object.entries(params.sendTo);

  for (const [listKey, to] of entries) {
    const data = await get(params, listKey);

    if (!data.length) {
      log(`Empty stats list '${listKey}'`);
      continue;
    }

    log(`Stats on '${listKey}' is sent to: ${to.join(', ')}`);

    await mails.send({
      queue: false,
      template: 'report',
      to,
      data: {
        data
      }
    });
  }

  mails.config.transporter.close();
}

module.exports = {
  push,
  get,
  sendReport
};
