const express = require('express');
const router = express.Router();
const { analyzeCompetitors, analyzeCompetitorsRandom } = require('../controllers/competitorController');
const { protect } = require('../middleware/authMiddleware');
const { checkCredits, deductCredits } = require('../middleware/creditMiddleware');

router.post('/analyze/:id', protect, checkCredits(1), analyzeCompetitors, deductCredits(1, 'competitor_analysis'));
router.post('/analyze', protect, checkCredits(1), analyzeCompetitorsRandom, deductCredits(1, 'competitor_analysis'));

module.exports = router;