// backend/controllers/pitchSimulatorController.js
const Idea = require('../models/Idea');
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

    const questions = await simulateInvestorQA(idea.ideaText);
    
    // Save the questions to the database
    idea.pitchSimulation = {
      questions: questions.questions.map(q => ({
        ...q,
        answer: '',
        feedback: null
      }))
    };
    await idea.save();
    
    res.json(idea);
  } catch (error) {
    logger.error('Error simulating pitch:', error);
    res.status(500).json({ message: error.message });
  }
};

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

    const question = idea.pitchSimulation.questions.find(q => q._id.toString() === questionId);

    if (!question) {
      return res.status(404).json({ message: 'Question not foundddd' });
    }

    const feedback = await simulateInvestorQA(idea.ideaText, question.question, answer);
    
    // Update the question with the answer and feedback
    question.answer = answer;
    question.feedback = feedback.feedback;
    await idea.save();
    
    res.json(idea);
  } catch (error) {
    logger.error('Error evaluating answer:', error);
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
    
    res.json(questions);
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
