const express = require('express');
const router = express.Router();
const { 
  getInvestors, 
  getInvestorById,
  matchInvestors
} = require('../controllers/investorController');
const { protect, premium } = require('../middleware/authMiddleware');
const { checkCredits } = require('../middleware/creditMiddleware');

// All investor routes require both authentication and premium status
router.use(protect);
router.use(premium);

router.get('/', getInvestors);
router.get('/:id', getInvestorById);
router.post('/match', checkCredits(2), matchInvestors);

module.exports = router;