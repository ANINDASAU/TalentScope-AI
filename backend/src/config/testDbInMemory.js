const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { connectDB, disconnectDB, sanitizeUri } = require('./db');

async function testInMemoryDb() {
  console.log('=====================================================');
  console.log('   TalentScope MongoDB In-Memory Connectivity Test   ');
  console.log('=====================================================');

  let mongod;
  try {
    console.log('[Test Setup]: Starting ephemeral in-memory MongoDB server...');
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    process.env.MONGO_URI = uri;
    console.log(`[Configured URI]: ${sanitizeUri(uri)}`);

    const startTime = Date.now();
    const conn = await connectDB(1, 1000);

    if (!conn || mongoose.connection.readyState !== 1) {
      throw new Error('Connection state was not ready (readyState !== 1)');
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ [Connection Verified]: Connected in ${duration}ms.`);
    console.log(`- Host: ${conn.connection.host}`);
    console.log(`- Database Name: ${conn.connection.name}`);
    console.log(`- Ready State: ${mongoose.connection.readyState} (Connected)`);

    // Verify DB Read / Write Capability
    const TestSchema = new mongoose.Schema({ name: String, createdAt: { type: Date, default: Date.now } });
    const TestModel = mongoose.model('ConnectionTest', TestSchema);
    
    const doc = await TestModel.create({ name: 'TalentScope DB Handshake Test' });
    console.log(`\n✅ [Write Test Passed]: Inserted doc ID: ${doc._id}`);

    const retrieved = await TestModel.findById(doc._id);
    console.log(`✅ [Read Test Passed]: Retrieved doc: "${retrieved.name}"`);

    // Run admin ping
    if (mongoose.connection.db) {
      const ping = await mongoose.connection.db.admin().ping();
      console.log(`✅ [Admin Ping Passed]:`, ping);
    }

    console.log('\n[Teardown]: Disconnecting and stopping in-memory server...');
    await disconnectDB();
    await mongod.stop();

    console.log('\n🎉 ALL DATABASE CONNECTIVITY CHECKS PASSED SUCCESSFULLY!');
    console.log('=====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

testInMemoryDb();
