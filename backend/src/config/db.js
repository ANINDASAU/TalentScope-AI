const mongoose = require('mongoose');

/**
 * Sanitizes MongoDB connection URI for secure logging without exposing passwords/credentials.
 * @param {string} uri
 * @returns {string}
 */
const sanitizeUri = (uri) => {
  if (!uri) return 'undefined';
  return uri.replace(/\/\/(.*?):(.*?)@/, '//$1:****@');
};

/**
 * Establishes Mongoose connection to MongoDB with retry logic and error handling.
 * @param {number} retryCount Maximum retry attempts
 * @param {number} retryDelayMs Delay between retries in milliseconds
 * @returns {Promise<typeof mongoose | null>}
 */
const connectDB = async (retryCount = 3, retryDelayMs = 3000) => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error('[Database Error]: MONGO_URI or MONGODB_URI environment variable is not defined.');
    return null;
  }

  const options = {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  };

  let attempts = 0;

  while (attempts < retryCount) {
    try {
      attempts++;
      console.log(`[Database]: Connecting to MongoDB (Attempt ${attempts}/${retryCount})...`);

      const conn = await mongoose.connect(uri, options);
      console.log(`[MongoDB Connected]: Host: ${conn.connection.host}, Database: ${conn.connection.name}`);
      return conn;
    } catch (err) {
      console.error(`[Database Connection Error]: ${err.message}`);
      if (attempts < retryCount) {
        console.log(`[Database]: Retrying connection in ${retryDelayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        console.error('[Database Error]: Max reconnection attempts reached. Could not connect to MongoDB.');
        return null;
      }
    }
  }
};

// Event Listeners for Lifecycle Monitoring
mongoose.connection.on('connected', () => {
  console.log('[Mongoose Event]: Connection established successfully.');
});

mongoose.connection.on('error', (err) => {
  console.error('[Mongoose Event Error]:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[Mongoose Event Warning]: Lost MongoDB connection.');
});

mongoose.connection.on('reconnected', () => {
  console.log('[Mongoose Event]: Reconnected to MongoDB.');
});

/**
 * Closes the active MongoDB connection cleanly for graceful shutdown.
 */
const disconnectDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
      console.log('[Mongoose Event]: MongoDB connection closed successfully.');
    }
  } catch (err) {
    console.error('[Database Disconnect Error]:', err.message);
  }
};

// Graceful Termination Process Handlers
process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDB();
  process.exit(0);
});

module.exports = {
  connectDB,
  disconnectDB,
  sanitizeUri
};
