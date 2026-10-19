const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');

// Load .env relative to backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { connectDB, disconnectDB, sanitizeUri } = require('./db');

async function runTest() {
  console.log('==============================================');
  console.log('   TalentScope MongoDB Connectivity Diagnostic');
  console.log('==============================================');

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  console.log(`[Configured URI]: ${sanitizeUri(uri)}`);

  if (!uri) {
    console.error('❌ FAILED: No MONGO_URI specified in environment.');
    process.exit(1);
  }

  try {
    const startTime = Date.now();
    const conn = await connectDB(2, 2000);

    if (!conn || mongoose.connection.readyState !== 1) {
      console.error('\n❌ FAILED: Could not establish active MongoDB connection state.');
      await disconnectDB();
      process.exit(1);
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ SUCCESS: Connected to MongoDB in ${duration}ms.`);
    console.log(`- Connection State: Connected (readyState: ${mongoose.connection.readyState})`);
    console.log(`- Database Name: ${mongoose.connection.name}`);
    console.log(`- Host: ${mongoose.connection.host}`);
    console.log(`- Port: ${mongoose.connection.port || 'default'}`);

    // Ping the database
    if (mongoose.connection.db) {
      const pingResult = await mongoose.connection.db.admin().ping();
      console.log(`- Admin Ping:`, pingResult);
    }

    await disconnectDB();
    console.log('==============================================\n');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ FAILED: MongoDB connection test failed with error: ${error.message}`);
    await disconnectDB();
    process.exit(1);
  }
}

runTest();
