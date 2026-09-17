import express from 'express';
import { getActivityHistory } from './dashboard.controller';
import { protect } from '../../shared/middleware/auth.middleware';

const router = express.Router();

router.get('/', protect, getActivityHistory);

export default router;
