const NodeFetchPlus = require('./dist');
const redis = require("redis"),
    redisClient = redis.createClient();
const util = require('util');
const { Agent } = require('https');

const agent = new Agent({
  rejectUnauthorized: false
})

const get = util.promisify(redisClient.get).bind(redisClient);
const set = util.promisify(redisClient.set).bind(redisClient);

const cache = {
  get: async (key) => {
    const res = await get(key);
    return JSON.parse(res);
  },
  set: (key, value, ttl) => {
    return set(key, JSON.stringify(value), 'PX', ttl);
  }
}

const client = new NodeFetchPlus({
  cache
});

client.on('response', console.log);

setInterval(async () => {
  try {
    const res = await client.fetch('https://revenue-deal-store.eu-west-1.prod.aws.skyscanner.local/billing-accounts/', {
      agent,
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

  } catch (err) {
    console.error(err);
  }
}, 1000);

