const { simulateInvestorQA } = require('../utils/geminiApi');
const logger = require('../utils/logger');

const simulatePitch = async (req, res) => {
  try {
    const { pitch } = req.body;

    if (!pitch) {
      return res.status(400).json({ message: 'Please provide your pitch' });
    }

    const questions = await simulateInvestorQA(pitch);
    
    res.json(questions);
  } catch (error) {
    logger.error('Error simulating pitch:', error);
    res.status(500).json({ message: error.message });
  }
};

const evaluateAnswer = async (req, res) => {
  try {
    const { pitch, question, answer } = req.body;

    if (!pitch || !question || !answer) {
      return res.status(400).json({ message: 'Please provide pitch, question, and answer' });
    }

    const feedback = await simulateInvestorQA(pitch, question, answer);
    
    res.json(feedback);
  } catch (error) {
    logger.error('Error evaluating answer:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  simulatePitch,
  evaluateAnswer
};