import express from 'express';
import { 
  getInvestors, 
  getInvestorById,
  matchInvestors
} from '../controllers/investorController';
import { protect, premium } from '../middleware/authMiddleware';
import { checkCredits } from '../middleware/creditMiddleware';

const router = express.Router();

// All investor routes require both authentication and premium status
router.use(protect);
router.use(premium);

router.get('/', getInvestors);
router.get('/:id', getInvestorById);
router.post('/match', checkCredits(2), matchInvestors);

export default router;
