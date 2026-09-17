import { Request, Response } from 'express';
import Idea from '../ideas/idea.model';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import { simulateInvestorQA } from '../../shared/integrations/gemini/gemini.client';
import logger from '../../config/logger';
import { logActivity } from '../../shared/utils/activity-logger';

export const simulatePitch = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const idea = await Idea.findById(id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // Only generate new questions if explicitly requested
    if (!idea.pitchSimulation?.questions || req.query.regenerate === 'true') {
      const questions = await simulateInvestorQA(idea.ideaText);
      
      idea.pitchSimulation = {
        questions: questions.questions.map((q: any, index: number) => ({
          id: `question_${index}`,
          question: q.question,
          category: q.category,
          answer: '',
          feedback: null
        }))
      };
      await idea.save();
    }

    // Deduct credits from database
    const user = await User.findById(req.user._id);
    if (user && user.credits >= 1) {
      user.credits = Math.max(0, user.credits - 1);
      await user.save();

      // Record transaction
      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -1,
        description: 'Used 1 credit for pitch simulation',
        relatedService: 'pitch_simulator'
      });
    }
    
    res.json({
      ...idea.toObject(),
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error simulating pitch:', error);
    res.status(500).json({ message: error.message });
  }
};

export const evaluateAnswer = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { questionId, answer } = req.body;
    
    const idea = await Idea.findById(id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    const question = idea.pitchSimulation?.questions?.find(q => q.id === questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    const feedback = await simulateInvestorQA(idea.ideaText, question.question, answer);
    
    // Update the specific question in the questions array
    const updatedQuestions = idea.pitchSimulation?.questions?.map(q => {
      if (q.id === questionId) {
        return {
          ...q,
          answer,
          feedback: feedback.feedback
        };
      }
      return q;
    }) || [];

    if (!idea.pitchSimulation) {
      idea.pitchSimulation = { questions: [] };
    }
    idea.pitchSimulation.questions = updatedQuestions;
    await idea.save();
    
    res.json({ feedback: feedback.feedback });
  } catch (error: any) {
    logger.error('Error evaluating answer:', error);

    if (error.message && error.message.includes('Failed to process pitch simulation')) {
      return res.status(503).json({ message: 'Service temporarily unavailable. Please try again shortly.' });
    }

    res.status(500).json({ message: error.message });
  }
};

export const simulatePitchRandom = async (req: Request, res: Response): Promise<any> => {
  try {
    const { pitch } = req.body;

    if (!pitch) {
      return res.status(400).json({ message: 'Please provide your pitch' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const questions = await simulateInvestorQA(pitch);

    // Log activity for random pitch simulation
    await logActivity(
      req.user._id,
      'pitch_simulator',
      `Pitch Simulation (Ad-hoc)`,
      'Generated investor-style Q&A for standalone pitch',
      questions,
      1,
      null
    );

    // Deduct credits from database
    const user = await User.findById(req.user._id);
    if (user && user.credits >= 1) {
      user.credits = Math.max(0, user.credits - 1);
      await user.save();

      // Record transaction
      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -1,
        description: 'Used 1 credit for pitch simulation',
        relatedService: 'pitch_simulator'
      });
    }
    
    res.json({
      ...questions,
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error simulating pitch:', error);
    res.status(500).json({ message: error.message });
  }
};

export const evaluateAnswerRandom = async (req: Request, res: Response): Promise<any> => {
  try {
    const { pitch, question, answer } = req.body;

    if (!pitch || !question || !answer) {
      return res.status(400).json({ message: 'Please provide pitch, question, and answer' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const feedback = await simulateInvestorQA(pitch, question, answer);
    
    // Log activity for random answer evaluation
    await logActivity(
      req.user._id,
      'pitch_simulator',
      `Pitch Q&A (Ad-hoc): ${question.substring(0, 50)}...`,
      'Evaluated answer for standalone pitch and generated feedback',
      { question, answer, feedback: feedback.feedback },
      0,
      null
    );
    res.json(feedback);
  } catch (error: any) {
    logger.error('Error evaluating answer:', error);
    res.status(500).json({ message: error.message });
  }
};

export default {
  simulatePitch,
  evaluateAnswer,
  simulatePitchRandom,
  evaluateAnswerRandom
};
