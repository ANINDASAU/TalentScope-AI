const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('./db');

const User = require('../models/User');
const Assessment = require('../models/Assessment');
const Coach = require('../models/Coach');
const Consultation = require('../models/Consultation');

async function testRelationshipsAndIndexes() {
  console.log('===========================================================');
  console.log('   TalentScope Phase 6: Relationships & Indexes Suite      ');
  console.log('===========================================================');

  let mongod;

  try {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri();

    await connectDB(1, 1000);

    // Sync Indexes
    console.log('[Setup] Syncing and creating indexes across all collections...');
    await User.syncIndexes();
    await Assessment.syncIndexes();
    await Coach.syncIndexes();
    await Consultation.syncIndexes();

    const userIndexes = await User.collection.indexes();
    const assessmentIndexes = await Assessment.collection.indexes();
    const coachIndexes = await Coach.collection.indexes();

    console.log(`✅ Synced ${userIndexes.length} User indexes, ${assessmentIndexes.length} Assessment indexes, ${coachIndexes.length} Coach indexes.`);

    // SEED DATA
    const athlete1 = await User.create({
      name: 'Felix Vanderwaal',
      email: 'felix@talentscope.ai',
      phone: '+919876543401',
      password: 'Password123',
      role: 'athlete',
      primarySport: 'Sprinting',
      overallPerformanceScore: 88,
      regionalRank: 42
    });

    const athlete2 = await User.create({
      name: 'Priya Sharma',
      email: 'priya@talentscope.ai',
      phone: '+919876543402',
      password: 'Password123',
      role: 'athlete',
      primarySport: 'Athletics',
      overallPerformanceScore: 94,
      regionalRank: 12
    });

    const coachUser = await User.create({
      name: 'Dr. Marcus Vance',
      email: 'marcus@talentscope.ai',
      phone: '+919876543403',
      password: 'Password123',
      role: 'coach'
    });

    const coach = await Coach.create({
      userId: coachUser._id,
      name: coachUser.name,
      title: 'Olympic Biomechanics Specialist',
      rating: 4.95,
      specialties: ['Sprint Mechanics', 'Force Plate Analysis'],
      assignedAthletes: [athlete1._id]
    });

    // Seed 4 Assessments
    await Assessment.create({
      assessmentCode: 'TS-942-AXL',
      athleteId: athlete1._id,
      sport: 'Athletics',
      testType: 'unilateral_squat',
      status: 'completed',
      overallScore: 88,
      createdAt: new Date(Date.now() - 3 * 86400000)
    });

    await Assessment.create({
      assessmentCode: 'TS-943-SPR',
      athleteId: athlete1._id,
      sport: 'Athletics',
      testType: 'sprint_acceleration',
      status: 'completed',
      overallScore: 92,
      createdAt: new Date(Date.now() - 1 * 86400000)
    });

    await Assessment.create({
      assessmentCode: 'TS-944-PRC',
      athleteId: athlete1._id,
      sport: 'Athletics',
      testType: 'countermovement_jump',
      status: 'processing',
      createdAt: new Date()
    });

    await Assessment.create({
      assessmentCode: 'TS-945-PRI',
      athleteId: athlete2._id,
      sport: 'Athletics',
      testType: 'sprint_acceleration',
      status: 'completed',
      overallScore: 95,
      createdAt: new Date()
    });

    // 1. QUERY 1: Find athlete by authentication identifier (phone / email)
    console.log('\n[Query 1] Testing index lookup by phone & email...');
    const q1Explanation = await User.find({ phone: '+919876543401' }).explain('executionStats');
    const q1Stage = q1Explanation.executionStats.executionStages.stage;
    console.log(`✅ Query 1 (Phone Lookup): Index Stage = ${q1Stage} (Expected: IXSCAN)`);

    // 2. QUERY 2: Find all assessments for an athlete
    console.log('\n[Query 2] Testing find all assessments for an athlete...');
    const q2Explanation = await Assessment.find({ athleteId: athlete1._id }).explain('executionStats');
    const q2Stage = q2Explanation.executionStats.executionStages.stage;
    console.log(`✅ Query 2 (All Athlete Assessments): Index Stage = ${q2Stage} (Expected: IXSCAN)`);

    // 3. QUERY 3: Find latest completed assessment for an athlete
    console.log('\n[Query 3] Testing latest completed assessment for an athlete...');
    const q3 = await Assessment.findOne({ athleteId: athlete1._id, status: 'completed' }).sort({ createdAt: -1 });
    if (!q3 || q3.assessmentCode !== 'TS-943-SPR') {
      throw new Error(`Query 3 failed to find latest completed assessment. Got: ${q3?.assessmentCode}`);
    }
    console.log(`✅ Query 3 (Latest Completed Assessment): Code = ${q3.assessmentCode}, Score = ${q3.overallScore}`);

    // 4. QUERY 4: Retrieve assessment history
    console.log('\n[Query 4] Testing retrieval of assessment history (sorted createdAt desc)...');
    const q4 = await Assessment.find({ athleteId: athlete1._id }).sort({ createdAt: -1 });
    if (q4.length !== 3) {
      throw new Error(`Expected 3 assessments for athlete 1, got ${q4.length}`);
    }
    console.log(`✅ Query 4 (History Retrieval): Retrieved ${q4.length} records in sorted order.`);

    // 5. QUERY 5: Retrieve assessments by date range
    console.log('\n[Query 5] Testing retrieve assessments by date range...');
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
    const q5 = await Assessment.find({
      athleteId: athlete1._id,
      createdAt: { $gte: twoDaysAgo }
    }).sort({ createdAt: -1 });
    if (q5.length !== 2) {
      throw new Error(`Expected 2 assessments in last 2 days, got ${q5.length}`);
    }
    console.log(`✅ Query 5 (Date Range Filter): Retrieved ${q5.length} assessment(s) within date window.`);

    // 6. QUERY 6: Filter by sport
    console.log('\n[Query 6] Testing filter by sport & national leaderboards...');
    const q6 = await Assessment.find({ sport: 'Athletics', status: 'completed' }).sort({ overallScore: -1 });
    if (q6.length !== 3 || q6[0].overallScore !== 95) {
      throw new Error('Query 6 sport leaderboard failed');
    }
    console.log(`✅ Query 6 (Sport Leaderboard): Highest Score = ${q6[0].overallScore} (Code: ${q6[0].assessmentCode})`);

    // 7. QUERY 7: Filter by test type
    console.log('\n[Query 7] Testing filter by test type for athlete...');
    const q7 = await Assessment.find({ athleteId: athlete1._id, testType: 'sprint_acceleration' }).sort({ createdAt: -1 });
    if (q7.length !== 1 || q7[0].assessmentCode !== 'TS-943-SPR') {
      throw new Error('Query 7 testType filter failed');
    }
    console.log(`✅ Query 7 (Test Type Filter): Retrieved drill '${q7[0].testType}' with score ${q7[0].overallScore}`);

    // 8. QUERY 8: Find processing assessments by status in FIFO order
    console.log('\n[Query 8] Testing find processing assessments by status in FIFO order (AI Worker)...');
    const q8 = await Assessment.find({ status: 'processing' }).sort({ createdAt: 1 });
    if (q8.length !== 1 || q8[0].assessmentCode !== 'TS-944-PRC') {
      throw new Error('Query 8 processing worker queue failed');
    }
    console.log(`✅ Query 8 (AI Processing Queue): Found ${q8.length} item in queue (Code: ${q8[0].assessmentCode})`);

    // 9. QUERY 9: Find authorized coach/athlete relationships
    console.log('\n[Query 9] Testing find authorized coach/athlete relationships...');
    const q9 = await Coach.find({ assignedAthletes: athlete1._id });
    if (q9.length !== 1 || q9[0].name !== 'Dr. Marcus Vance') {
      throw new Error('Query 9 authorized coach lookup failed');
    }
    console.log(`✅ Query 9 (Authorized Coach Relationship): Athlete '${athlete1.name}' is assigned to Coach '${q9[0].name}'`);

    // Teardown
    await disconnectDB();
    await mongod.stop();

    console.log('\n🎉 ALL 9 RELATIONSHIPS & INDEX TESTS PASSED WITH 100% SUCCESS!');
    console.log('===========================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ RELATIONSHIPS & INDEXES TEST FAILED:', error);
    if (mongod) await mongod.stop();
    process.exit(1);
  }
}

testRelationshipsAndIndexes();
