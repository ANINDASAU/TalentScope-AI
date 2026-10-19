module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`[Socket Connected]: ${socket.id}`);

    // Join session room
    socket.on('join_session', (sessionId) => {
      socket.join(sessionId);
      console.log(`Socket ${socket.id} joined session ${sessionId}`);
    });

    // Handle frame keypoints data stream
    socket.on('stream_frame_keypoints', (data) => {
      // Broadcast real-time feedback
      socket.emit('live_feedback', {
        timestamp: Date.now(),
        poseAccuracy: 94,
        kneeValgusWarning: false,
        jointAngles: {
          kneeFlexion: 118,
          spineAngle: 4.2
        }
      });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket Disconnected]: ${socket.id}`);
    });
  });
};
