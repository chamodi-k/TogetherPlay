import express from 'express';
import {
  createRoom,
  getRoomByCode,
  getMyRooms,
  getRoomMessages,
  getWatchHistory,
  saveWatchHistory,
} from '../controllers/roomController.js';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticateToken, createRoom);
router.get('/my', authenticateToken, getMyRooms);
router.get('/history', authenticateToken, getWatchHistory);
router.post('/history', authenticateToken, saveWatchHistory);
router.get('/:code', optionalAuthenticateToken, getRoomByCode);
router.get('/:roomId/messages', optionalAuthenticateToken, getRoomMessages);

export default router;
