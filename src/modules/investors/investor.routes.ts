import express from 'express';
import { 
  getInvestors, 
  getInvestorById,
  matchInvestors
} from './investor.controller';
import { protect, premium } from '../../shared/middleware/auth.middleware';
import { checkCredits } from '../../shared/middleware/credit.middleware';

const router = express.Router();

// All investor routes require both authentication and premium status
router.use(protect);
router.use(premium);

router.get('/', getInvestors);
router.get('/:id', getInvestorById);
router.post('/match', checkCredits(2), matchInvestors);

export default router;
