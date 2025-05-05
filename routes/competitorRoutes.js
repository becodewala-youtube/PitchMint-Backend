const express = require('express');
const router = express.Router();
const { analyzeCompetitors } = require('../controllers/competitorController');
const { protect } = require('../middleware/authMiddleware');

router.post('/analyze', protect, analyzeCompetitors);

module.exports = router;