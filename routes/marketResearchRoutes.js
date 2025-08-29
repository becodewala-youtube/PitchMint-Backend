const express = require('express');
const router = express.Router();
const { analyzeMarket } = require('../controllers/marketResearchController');
const { protect } = require('../middleware/authMiddleware');
const { checkCredits } = require('../middleware/creditMiddleware');

router.post('/analyze', protect, checkCredits(2), analyzeMarket);

module.exports = router;