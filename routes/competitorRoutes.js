const express = require('express');
const router = express.Router();
const { analyzeCompetitors } = require('../controllers/competitorController');
const { protect } = require('../middleware/authMiddleware');

router.post('/analyze', protect, analyzeCompetitors);
router.post('/analyze/:id', protect, analyzeCompetitors);

module.exports = router;