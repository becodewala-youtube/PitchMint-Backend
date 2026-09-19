import { Request, Response } from 'express';
import Idea from '../ideas/idea.model';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import { generateCanvas } from '../../shared/integrations/gemini/gemini.client';
import logger from '../../config/logger';
import { atomicDeductCredits, refundCredits } from '../../shared/middleware/credit.middleware';

// @desc    Generate a business model canvas for an idea
// @route   POST /api/canvas/:id
// @access  Private
export const generateCanvasForIdea = async (req: Request, res: Response): Promise<any> => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ success: false, message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this idea' });
    }

    // Atomically deduct credits before external API call
    const deduction = await atomicDeductCredits(req.user._id, 1, 'canvas');
    if (!deduction.success) {
      return res.status(402).json({ success: false, message: 'Insufficient credits' });
    }

    try {
      // Generate canvas
      const canvasContent = await generateCanvas(idea.ideaText, idea.analysis);
      
      // Update idea with canvas content
      idea.canvasContent = canvasContent;
      await idea.save();
    } catch (opError) {
      await refundCredits(req.user._id, deduction.split, 'canvas');
      throw opError;
    }

    // Get fresh user credits
    const user = await User.findById(req.user._id);

    logger.info(`Generated canvas for idea ${idea._id}`);
    res.json({
      ...idea.toObject(),
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error generating canvas:', error);
    res.status(500).json({ success: false, message: 'Failed to generate canvas' });
  }
};

// @desc    Regenerate a canvas for an idea
// @route   PUT /api/canvas/:id
// @access  Private
export const regenerateCanvas = async (req: Request, res: Response): Promise<any> => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ success: false, message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this idea' });
    }

    // Atomically deduct credits before external API call
    const deduction = await atomicDeductCredits(req.user._id, 1, 'canvas');
    if (!deduction.success) {
      return res.status(402).json({ success: false, message: 'Insufficient credits' });
    }

    try {
      // Generate new canvas
      const canvasContent = await generateCanvas(idea.ideaText, idea.analysis);
      
      // Update idea with new canvas content
      idea.canvasContent = canvasContent;
      await idea.save();
    } catch (opError) {
      await refundCredits(req.user._id, deduction.split, 'canvas');
      throw opError;
    }

    // Get updated user with current credits
    const user = await User.findById(req.user._id);

    logger.info(`Regenerated canvas for idea ${idea._id}`);
    res.json({
      ...idea.toObject(),
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error regenerating canvas:', error);
    res.status(500).json({ success: false, message: 'Failed to regenerate canvas' });
  }
};

export default {
  generateCanvasForIdea,
  regenerateCanvas
};
