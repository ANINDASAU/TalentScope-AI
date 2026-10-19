const { getRedisClient, isRedisAvailable } = require('../config/redis');

/**
 * TalentScope Redis Cache Service
 * Secondary caching layer designed with safe failure fallback to MongoDB.
 */
class RedisService {
  // Key generators
  static getDashboardKey(athleteId) {
    return `athlete:dashboard:${athleteId}`;
  }

  static getLatestAssessmentKey(athleteId) {
    return `athlete:latest_assessment:${athleteId}`;
  }

  static getProgressKey(athleteId) {
    return `athlete:progress:${athleteId}`;
  }

  static getSportBenchmarkKey(sport) {
    return `benchmarks:sport:${sport.toLowerCase()}`;
  }

  /**
   * Invalidate all cached data for a specific athlete
   * Called whenever an assessment completes, results update, or athlete profile changes
   * @param {string|mongoose.Types.ObjectId} athleteId
   */
  static async invalidateAthleteCache(athleteId) {
    if (!athleteId) return false;
    const strId = athleteId.toString();
    const keys = [
      this.getDashboardKey(strId),
      this.getLatestAssessmentKey(strId),
      this.getProgressKey(strId)
    ];
    return await this.del(keys);
  }

  /**
   * Get cached value by key
   * @param {string} key Cache key
   * @returns {Promise<any|null>} Parsed value or null if miss/offline
   */
  static async get(key) {
    const client = getRedisClient();
    if (!client) return null;

    try {
      const data = await client.get(key);
      if (!data) return null;
      try {
        return JSON.parse(data);
      } catch (parseErr) {
        return data;
      }
    } catch (error) {
      console.warn(`[Redis Service Warning]: Cache get failed for key "${key}" (${error.message}). Falling back to DB.`);
      return null;
    }
  }

  /**
   * Set cached value with TTL (Time To Live)
   * @param {string} key Cache key
   * @param {any} value Value to store
   * @param {number} ttlSeconds Expiration in seconds (default: 300 = 5 mins)
   * @returns {Promise<boolean>} True if stored, false if offline/failed
   */
  static async set(key, value, ttlSeconds = 300) {
    const client = getRedisClient();
    if (!client) return false;

    try {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      if (ttlSeconds > 0) {
        await client.set(key, stringValue, 'EX', ttlSeconds);
      } else {
        await client.set(key, stringValue);
      }
      return true;
    } catch (error) {
      console.warn(`[Redis Service Warning]: Cache set failed for key "${key}" (${error.message}).`);
      return false;
    }
  }

  /**
   * Delete cached key(s)
   * @param {string|string[]} keys Single key or array of keys
   * @returns {Promise<boolean>}
   */
  static async del(keys) {
    const client = getRedisClient();
    if (!client) return false;

    try {
      const keyList = Array.isArray(keys) ? keys : [keys];
      if (keyList.length === 0) return true;
      await client.del(...keyList);
      return true;
    } catch (error) {
      console.warn(`[Redis Service Warning]: Cache del failed for keys (${error.message}).`);
      return false;
    }
  }

  /**
   * Delete keys matching a wildcard pattern (e.g. "athlete:6a899*:*")
   * @param {string} pattern Pattern to match
   * @returns {Promise<number>} Number of keys deleted
   */
  static async delByPattern(pattern) {
    const client = getRedisClient();
    if (!client) return 0;

    try {
      const keys = await client.keys(pattern);
      if (keys && keys.length > 0) {
        const prefix = process.env.REDIS_KEY_PREFIX || 'ts:';
        const cleanedKeys = keys.map((k) => (k.startsWith(prefix) ? k.slice(prefix.length) : k));
        await client.del(...cleanedKeys);
        return cleanedKeys.length;
      }
      return 0;
    } catch (error) {
      console.warn(`[Redis Service Warning]: Cache delByPattern failed for pattern "${pattern}" (${error.message}).`);
      return 0;
    }
  }

  /**
   * Get Time-To-Live (TTL) of a key in seconds
   * @param {string} key Cache key
   * @returns {Promise<number>} Remaining seconds, -1 if no TTL, -2 if key does not exist
   */
  static async ttl(key) {
    const client = getRedisClient();
    if (!client) return -2;

    try {
      return await client.ttl(key);
    } catch (error) {
      return -2;
    }
  }

  /**
   * Check connection status
   * @returns {boolean}
   */
  static isAvailable() {
    return isRedisAvailable();
  }
}

module.exports = RedisService;
