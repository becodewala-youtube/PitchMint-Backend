import { Request, Response } from 'express';
import Investor from './investor.model';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import { matchInvestors as aiMatchInvestors } from '../../shared/integrations/gemini/gemini.client';
import logger from '../../config/logger';
import { logActivity } from '../../shared/utils/activity-logger';
import { atomicDeductCredits, refundCredits } from '../../shared/middleware/credit.middleware';

// @desc    Get all investors
// @route   GET /api/investors
// @access  Private/Premium
export const getInvestors = async (req: Request, res: Response): Promise<any> => {
  try {
    // Get query parameters for filtering
    const { type, industry } = req.query;
    
    const query: any = {};
    
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
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get investor by ID
// @route   GET /api/investors/:id
// @access  Private/Premium
export const getInvestorById = async (req: Request, res: Response): Promise<any> => {
  try {
    const investor = await Investor.findById(req.params.id);
    
    if (!investor) {
      return res.status(404).json({ success: false, message: 'Investor not found' });
    }
    
    res.json(investor);
  } catch (error: any) {
    console.error('Error getting investor:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Match investors based on startup criteria
// @route   POST /api/investors/match
// @access  Private/Premium
export const matchInvestors = async (req: Request, res: Response): Promise<any> => {
  try {
    const criteria = req.body;
    
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    // Atomically deduct credits before external API call
    const deduction = await atomicDeductCredits(req.user._id, 2, 'investor_matching');
    if (!deduction.success) {
      return res.status(402).json({ success: false, message: 'Insufficient credits' });
    }

    let matches;
    try {
      // Generate AI-powered investor matches
      matches = await aiMatchInvestors(criteria);
      
      // Log activity
      await logActivity(
        req.user._id,
        'investor_matching',
        `Investor Matching: ${criteria.industry} - ${criteria.stage}`,
        `Found ${matches.length} investor matches for ${criteria.industry} startup`,
        { criteria, matches },
        2
      );
    } catch (opError) {
      await refundCredits(req.user._id, deduction.split, 'investor_matching');
      throw opError;
    }

    // Get fresh user credits
    const user = await User.findById(req.user._id);
    
    logger.info(`Generated investor matches for user ${req.user._id}`);
    res.json({
      matches,
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error matching investors:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  getInvestors,
  getInvestorById,
  matchInvestors
};
