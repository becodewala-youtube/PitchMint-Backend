const express = require('express');
const router = express.Router();
const { 
  getInvestors, 
  getInvestorById 
} = require('../controllers/investorController');
const { protect, premium } = require('../middleware/authMiddleware');

// All investor routes require both authentication and premium status
router.use(protect);
router.use(premium);

router.get('/', getInvestors);
router.get('/:id', getInvestorById);

module.exports = router;