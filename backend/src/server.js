const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { connectDB, disconnectDB } = require('./config/db');
const { connectRedis, disconnectRedis } = require('./config/redis');

// Load environment variables
dotenv.config();

// Connect to MongoDB (Primary Source of Truth)
connectDB();

// Initialize Redis (Secondary Caching Layer - Optional/Resilient)
connectRedis();

/**
 * Duplicate-prevention index (Phase 6): one assessment per (athlete,
 * idempotencyKey). Ensured explicitly so it exists even on pre-existing
 * collections where Mongoose's autoIndex may not have applied it.
 */
const mongoose = require('mongoose');
const connectIdempotencyIndex = async () => {
  try {
    await mongoose.connection.asPromise();
    await mongoose.connection.collection('assessments').createIndex(
      { athleteId: 1, idempotencyKey: 1 },
      {
        unique: true,
        name: 'athleteId_1_idempotencyKey_1_unique',
        partialFilterExpression: { idempotencyKey: { $type: 'string' } }
      }
    );
    console.log('[Index] idempotency unique index ensured on assessments');
  } catch (e) {
    console.warn('[Index] could not ensure idempotency index:', e.message);
  }
};
connectIdempotencyIndex();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/authRoutes');
const athleteRoutes = require('./routes/athleteRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const coachRoutes = require('./routes/coachRoutes');
const consultationRoutes = require('./routes/consultationRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/athletes', athleteRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/coaches', coachRoutes);
app.use('/api/consultations', consultationRoutes);

// Socket.io for Real-time Pose Validation & Live Feedback
require('./sockets/liveAssessmentSocket')(io);

// Graceful Shutdown
const handleShutdown = async (signal) => {
  console.log(`\n[Server]: Received ${signal}. Commencing graceful shutdown...`);
  server.close(async () => {
    await disconnectRedis();
    await disconnectDB();
    console.log('[Server]: All connections closed cleanly. Exiting.');
    process.exit(0);
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[TalentScope Server] Listening on port ${PORT}`);
});
