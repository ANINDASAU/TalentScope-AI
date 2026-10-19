const Redis = require('ioredis');

let redisClient = null;
let isConnected = false;

/**
 * Initialize and connect Redis client
 * Resilient: Never crashes the application if Redis is offline/unavailable.
 */
const connectRedis = (customOptions = {}) => {
  const isEnabled = process.env.REDIS_ENABLED !== 'false';

  if (!isEnabled) {
    console.log('[Redis]: Disabled via REDIS_ENABLED=false. Operating in MongoDB-only mode.');
    return null;
  }

  // Avoid creating multiple clients
  if (redisClient) {
    return redisClient;
  }

  const options = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'ts:',
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false, // Prevents request blocking when Redis is down
    lazyConnect: true, // Allows explicit asynchronous connection
    retryStrategy: (times) => {
      // Reconnect with backoff up to 3 attempts, then back off to 10s intervals
      if (times > 3) {
        return 10000;
      }
      return Math.min(times * 500, 2000);
    },
    ...customOptions
  };

  try {
    redisClient = new Redis(options);

    redisClient.on('connect', () => {
      console.log(`[Redis Event]: Connected to Redis server at ${options.host}:${options.port}`);
    });

    redisClient.on('ready', () => {
      isConnected = true;
      console.log('[Redis Event]: Redis client ready to accept cache commands.');
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      // Log as non-fatal warning so Node.js backend does NOT crash
      console.warn(`[Redis Warning]: Redis unavailable (${err.message}). Falling back to MongoDB.`);
    });

    redisClient.on('close', () => {
      isConnected = false;
    });

    redisClient.on('reconnecting', (time) => {
      console.log(`[Redis Event]: Reconnecting in ${time}ms...`);
    });

    // Attempt non-blocking connection
    redisClient.connect().catch((err) => {
      isConnected = false;
      console.warn(`[Redis Warning]: Initial connection failed (${err.message}). Application running with MongoDB-only.`);
    });

    return redisClient;
  } catch (error) {
    console.warn(`[Redis Init Warning]: Failed to initialize Redis client (${error.message}). Running with MongoDB.`);
    redisClient = null;
    isConnected = false;
    return null;
  }
};

/**
 * Retrieve active Redis client instance
 */
const getRedisClient = () => redisClient;

/**
 * Check if Redis is currently connected and healthy
 */
const isRedisAvailable = () => {
  return isConnected && redisClient && redisClient.status === 'ready';
};

/**
 * Set custom mock or in-memory client (used for testing)
 */
const setRedisClient = (client) => {
  redisClient = client;
  isConnected = client !== null;
};

/**
 * Graceful shutdown of Redis connection
 */
const disconnectRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Redis Event]: Redis connection closed gracefully.');
    } catch (err) {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
    }
  }
};

module.exports = {
  connectRedis,
  getRedisClient,
  isRedisAvailable,
  setRedisClient,
  disconnectRedis
};
