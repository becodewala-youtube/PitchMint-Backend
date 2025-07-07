const express = require('express');
const router = express.Router();
const { simulatePitch, evaluateAnswer, simulatePitchRandom, evaluateAnswerRandom } = require('../controllers/pitchSimulatorController');
const { protect } = require('../middleware/authMiddleware');
const { checkCredits, deductCredits } = require('../middleware/creditMiddleware');

router.post('/simulate/:id', protect, checkCredits(1), simulatePitch, deductCredits(1, 'pitch_simulator'));
router.post('/evaluate/:id', protect, evaluateAnswer);
router.post('/simulate', protect, checkCredits(1), simulatePitchRandom, deductCredits(1, 'pitch_simulator'));
router.post('/evaluate', protect, evaluateAnswerRandom);

module.exports = router;