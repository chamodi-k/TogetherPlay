import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import { registerSocketHandlers } from './sockets/roomHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const configuredClientUrls = (process.env.CLIENT_URL || '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  ...configuredClientUrls,
  'https://chamo12.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const isAllowedOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.has(origin)) {
    return callback(null, true);
  }

  try {
    const url = new URL(origin);
    const isLocalNetwork =
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        /^192\.168\./.test(url.hostname) ||
        /^10\./.test(url.hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname));

    return callback(null, isLocalNetwork);
  } catch {
    return callback(new Error('Origin not allowed'));
  }
};

// Setup Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: isAllowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(
  cors({
    origin: isAllowedOrigin,
    credentials: true,
  })
);
app.use(express.json());

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'TogetherPlay Backend API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Register Real-time WebRTC and Video Sync Socket Handlers
registerSocketHandlers(io);

// Server boot sequence
async function startServer() {
  try {
    await initDatabase();

    server.listen(PORT, () => {
      console.log('====================================================');
      console.log(`🎬 TogetherPlay Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.IO Real-time Engine initialized`);
      console.log(`🔗 Allowed Client Origins: ${[...allowedOrigins].join(', ')}`);
      console.log('====================================================');
    });
  } catch (err) {
    console.error('❌ Failed to start TogetherPlay Server:', err);
    process.exit(1);
  }
}

startServer();
