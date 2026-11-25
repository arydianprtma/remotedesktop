const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Map of registered hosts: deviceId -> { socketId, pin, deviceName, onlineSince }
const registeredHosts = new Map();

// Map of active peer sessions: socketId -> peerSocketId
const activeSessions = new Map();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeHosts: registeredHosts.size,
    hosts: Array.from(registeredHosts.entries()).map(([k, v]) => ({ deviceId: k, socketId: v.socketId, deviceName: v.deviceName })),
    sessions: Array.from(activeSessions.entries()).map(([k, v]) => ({ from: k, to: v })),
    timestamp: new Date().toISOString()
  });
});

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Host registers itself to be discovered by controller
  socket.on('register-host', (data, callback) => {
    const { deviceId, deviceName, pin } = data || {};
    if (!deviceId || !pin) {
      if (typeof callback === 'function') callback({ success: false, error: 'DeviceId and PIN are required' });
      return;
    }

    // Register host
    registeredHosts.set(deviceId, {
      socketId: socket.id,
      deviceId,
      deviceName: deviceName || 'Home PC',
      pin,
      onlineSince: Date.now()
    });

    socket.deviceId = deviceId;
    socket.isHost = true;
    console.log(`[Host Registered] Device: ${deviceId} (${deviceName})`);

    if (typeof callback === 'function') {
      callback({ success: true, message: 'Host registered successfully' });
    }
  });

  // Controller requests connection to host
  socket.on('request-connect', (data, callback) => {
    const { targetDeviceId, pin } = data || {};
    const hostInfo = registeredHosts.get(targetDeviceId);

    if (!hostInfo) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Host device is offline or does not exist.' });
      }
      return;
    }

    // Verify PIN for Unattended Access
    if (hostInfo.pin !== pin) {
      console.log(`[Auth Failed] Incorrect PIN attempt for ${targetDeviceId}`);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Invalid PIN. Access denied.' });
      }
      return;
    }

    // Link sessions
    activeSessions.set(socket.id, hostInfo.socketId);
    activeSessions.set(hostInfo.socketId, socket.id);

    console.log(`[Session Initiated] Controller (${socket.id}) connecting to Host ${targetDeviceId} (${hostInfo.socketId})`);

    // Notify Host about the incoming controller
    io.to(hostInfo.socketId).emit('incoming-controller', {
      controllerSocketId: socket.id
    });

    if (typeof callback === 'function') {
      callback({
        success: true,
        hostSocketId: hostInfo.socketId,
        deviceName: hostInfo.deviceName
      });
    }
  });

  // Dual-Engine Relay: Screen Video Frame Relay
  let frameCount = 0;
  socket.on('relay-frame', (data) => {
    frameCount++;
    if (frameCount % 30 === 1) {
      const type = typeof data;
      const len = data ? (data.length || data.byteLength || 0) : 0;
      const preview = (typeof data === 'string') ? data.substring(0, 40) : 'binary';
      console.log(`[RelayFrame #${frameCount}] from ${socket.id}, type=${type}, len=${len}, start=${preview}`);
    }
    const peerSocketId = activeSessions.get(socket.id);
    if (peerSocketId) {
      socket.to(peerSocketId).volatile.emit('relay-frame', data);
    }
  });

  // Dual-Engine Relay: Input Simulation Relay
  socket.on('relay-input', (data) => {
    const peerSocketId = activeSessions.get(socket.id);
    if (peerSocketId) {
      socket.to(peerSocketId).emit('relay-input', data);
    }
  });

  // WebRTC Signaling: Offer
  socket.on('signal-offer', ({ targetSocketId, offer }) => {
    io.to(targetSocketId).emit('signal-offer', {
      senderSocketId: socket.id,
      offer
    });
  });

  // WebRTC Signaling: Answer
  socket.on('signal-answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('signal-answer', {
      senderSocketId: socket.id,
      answer
    });
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('signal-ice', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('signal-ice', {
      senderSocketId: socket.id,
      candidate
    });
  });

  // Handle manual session disconnect
  socket.on('end-session', () => {
    const peerSocketId = activeSessions.get(socket.id);
    if (peerSocketId) {
      io.to(peerSocketId).emit('peer-disconnected');
      activeSessions.delete(peerSocketId);
    }
    activeSessions.delete(socket.id);
  });

  // Disconnection handler
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);

    // If host disconnected, clean up registry
    if (socket.isHost && socket.deviceId) {
      registeredHosts.delete(socket.deviceId);
      console.log(`[Host Deregistered] Device: ${socket.deviceId}`);
    }

    // If active session exists, notify peer
    const peerSocketId = activeSessions.get(socket.id);
    if (peerSocketId) {
      io.to(peerSocketId).emit('peer-disconnected');
      activeSessions.delete(peerSocketId);
    }
    activeSessions.delete(socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[Remote Desk Signaling Server] Running on http://localhost:${PORT}`);
});
