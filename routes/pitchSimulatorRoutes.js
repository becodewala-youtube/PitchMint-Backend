const express = require('express');
const router = express.Router();
const { simulatePitch, evaluateAnswer } = require('../controllers/pitchSimulatorController');
const { protect } = require('../middleware/authMiddleware');

router.post('/simulate', protect, simulatePitch);
router.post('/evaluate', protect, evaluateAnswer);

module.exports = router;