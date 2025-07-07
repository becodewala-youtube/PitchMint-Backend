// backend/controllers/pitchSimulatorController.js
const Idea = require('../models/Idea');
const User = require('../models/User');
const { simulateInvestorQA } = require('../utils/geminiApi');
const logger = require('../utils/logger');

const simulatePitch = async (req, res) => {
  try {
    const { id } = req.params;
    const idea = await Idea.findById(id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // Only generate new questions if explicitly requested
    if (!idea.pitchSimulation?.questions || req.query.regenerate === 'true') {
      const questions = await simulateInvestorQA(idea.ideaText);
      
      idea.pitchSimulation = {
        questions: questions.questions.map((q, index) => ({
          id: `question_${index}`,
          question: q.question,
          category: q.category,
          answer: '',
          feedback: null
        }))
      };
      await idea.save();
    }

    // Get updated user with current credits
    const updatedUser = await User.findById(req.user._id);
    
    res.json({
      ...idea.toObject(),
      userCredits: updatedUser.credits
    });
  } catch (error) {
    logger.error('Error simulating pitch:', error);
    res.status(500).json({ message: error.message });
  }
};

// backend/controllers/pitchSimulatorController.js
const evaluateAnswer = async (req, res) => {
  try {
    const { id } = req.params;
    const { questionId, answer } = req.body;
    
    const idea = await Idea.findById(id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    const question = idea.pitchSimulation.questions.find(q => q.id === questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    const feedback = await simulateInvestorQA(idea.ideaText, question.question, answer);
    
    // Update the specific question in the questions array
    const updatedQuestions = idea.pitchSimulation.questions.map(q => {
      if (q.id === questionId) {
        return {
          ...q,
          answer,
          feedback: feedback.feedback
        };
      }
      return q;
    });

    idea.pitchSimulation.questions = updatedQuestions;
    await idea.save();
    
    res.json({ feedback: feedback.feedback });
  } catch (error) {
  logger.error('Error evaluating answer:', error);

  if (error.message.includes('Failed to process pitch simulation')) {
    return res.status(503).json({ message: 'Service temporarily unavailable. Please try again shortly.' });
  }

  res.status(500).json({ message: error.message });
}

};




const simulatePitchRandom = async (req, res) => {
  try {
    const { pitch } = req.body;

    if (!pitch) {
      return res.status(400).json({ message: 'Please provide your pitch' });
    }

    const questions = await simulateInvestorQA(pitch);

    // Get updated user with current credits
    const updatedUser = await User.findById(req.user._id);
    
    res.json({
      ...questions,
      userCredits: updatedUser.credits
    });
  } catch (error) {
    logger.error('Error simulating pitch:', error);
    res.status(500).json({ message: error.message });
  }
};

const evaluateAnswerRandom = async (req, res) => {
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
  evaluateAnswer,
  simulatePitchRandom,
  evaluateAnswerRandom
};