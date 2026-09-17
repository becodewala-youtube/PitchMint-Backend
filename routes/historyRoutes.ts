import express from 'express';
import { getActivityHistory } from '../controllers/historyController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', protect, getActivityHistory);

export default router;
