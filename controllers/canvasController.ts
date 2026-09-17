import { Request, Response } from 'express';
import Idea from '../models/Idea';
import User from '../models/User';
import CreditTransaction from '../models/CreditTransaction';
import { generateCanvas } from '../utils/geminiApi';
import logger from '../utils/logger';

// @desc    Generate a business model canvas for an idea
// @route   POST /api/canvas/:id
// @access  Private
export const generateCanvasForIdea = async (req: Request, res: Response): Promise<any> => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // Generate canvas
    const canvasContent = await generateCanvas(idea.ideaText, idea.analysis);
    
    // Update idea with canvas content
    idea.canvasContent = canvasContent;
    await idea.save();

    // CRITICAL FIX: Deduct credits from database
    const user = await User.findById(req.user._id);
    if (user && user.credits >= 1) {
      user.credits = Math.max(0, user.credits - 1);
      await user.save();

      // Record transaction
      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -1,
        description: 'Used 1 credit for canvas generation',
        relatedService: 'canvas'
      });
    }

    logger.info(`Generated canvas for idea ${idea._id}`);
    res.json({
      ...idea.toObject(),
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error generating canvas:', error);
    res.status(500).json({ message: 'Failed to generate canvas' });
  }
};

// @desc    Regenerate a canvas for an idea
// @route   PUT /api/canvas/:id
// @access  Private
export const regenerateCanvas = async (req: Request, res: Response): Promise<any> => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // Generate new canvas
    const canvasContent = await generateCanvas(idea.ideaText, idea.analysis);
    
    // Update idea with new canvas content
    idea.canvasContent = canvasContent;
    await idea.save();

    // CRITICAL FIX: Deduct credits from database
    const user = await User.findById(req.user._id);
    if (user && user.credits >= 1) {
      user.credits = Math.max(0, user.credits - 1);
      await user.save();

      // Record transaction
      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -1,
        description: 'Used 1 credit for canvas regeneration',
        relatedService: 'canvas'
      });
    }

    logger.info(`Regenerated canvas for idea ${idea._id}`);
    res.json({
      ...idea.toObject(),
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error regenerating canvas:', error);
    res.status(500).json({ message: 'Failed to regenerate canvas' });
  }
};

export default {
  generateCanvasForIdea,
  regenerateCanvas
};
