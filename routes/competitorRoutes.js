const express = require('express');
const router = express.Router();
const { analyzeCompetitors,analyzeCompetitorsRandom } = require('../controllers/competitorController');
const { protect } = require('../middleware/authMiddleware');

router.post('/analyze', protect, analyzeCompetitorsRandom);
router.post('/analyze/:id', protect, analyzeCompetitors);

module.exports = router;