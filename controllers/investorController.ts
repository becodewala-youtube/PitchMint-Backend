import { Request, Response } from 'express';
import Investor from '../models/Investor';
import User from '../models/User';
import CreditTransaction from '../models/CreditTransaction';
import { matchInvestors as aiMatchInvestors } from '../utils/geminiApi';
import logger from '../utils/logger';
import { logActivity } from '../utils/activityLogger';

// @desc    Get all investors
// @route   GET /api/investors
// @access  Private/Premium
export const getInvestors = async (req: Request, res: Response): Promise<any> => {
  try {
    // Get query parameters for filtering
    const { type, industry } = req.query;
    
    let query: any = {};
    
    // Add filters if provided
    if (type) {
      query.type = type;
    }
    
    if (industry) {
      query.industryFocus = { $in: [industry] };
    }
    
    const investors = await Investor.find(query).sort({ name: 1 });
    
    res.json(investors);
  } catch (error: any) {
    console.error('Error getting investors:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get investor by ID
// @route   GET /api/investors/:id
// @access  Private/Premium
export const getInvestorById = async (req: Request, res: Response): Promise<any> => {
  try {
    const investor = await Investor.findById(req.params.id);
    
    if (!investor) {
      return res.status(404).json({ message: 'Investor not found' });
    }
    
    res.json(investor);
  } catch (error: any) {
    console.error('Error getting investor:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Match investors based on startup criteria
// @route   POST /api/investors/match
// @access  Private/Premium
export const matchInvestors = async (req: Request, res: Response): Promise<any> => {
  try {
    const criteria = req.body;
    
    if (!req.user?._id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Generate AI-powered investor matches
    const matches = await aiMatchInvestors(criteria);
    
    // Log activity
    await logActivity(
      req.user._id,
      'investor_matching',
      `Investor Matching: ${criteria.industry} - ${criteria.stage}`,
      `Found ${matches.length} investor matches for ${criteria.industry} startup`,
      { criteria, matches },
      2
    );

    // Deduct credits from database
    const user = await User.findById(req.user._id);
    if (user && user.credits >= 2) {
      user.credits = Math.max(0, user.credits - 2);
      await user.save();

      // Record transaction
      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -2,
        description: 'Used 2 credits for investor matchmaking',
        relatedService: 'investor_matching'
      });
    }
    
    logger.info(`Generated investor matches for user ${req.user._id}`);
    res.json({
      matches,
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error matching investors:', error);
    res.status(500).json({ message: error.message });
  }
};

export default {
  getInvestors,
  getInvestorById,
  matchInvestors
};
