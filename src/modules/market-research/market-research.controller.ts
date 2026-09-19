import { Request, Response } from 'express';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import { generateMarketResearch } from '../../shared/integrations/gemini/gemini.client';
import logger from '../../config/logger';
import { logActivity } from '../../shared/utils/activity-logger';
import { atomicDeductCredits, refundCredits } from '../../shared/middleware/credit.middleware';

// @desc    Analyze market for startup idea
// @route   POST /api/market-research/analyze
// @access  Private
export const analyzeMarket = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ideaText, industry, targetRegion } = req.body;

    if (!ideaText || !industry || !targetRegion) {
      return res.status(400).json({ success: false, message: 'Please provide startup idea, industry, and target region' 
      });
    }

    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    // Atomically deduct credits before external API call
    const deduction = await atomicDeductCredits(req.user._id, 2, 'market_research');
    if (!deduction.success) {
      return res.status(402).json({ success: false, message: 'Insufficient credits' });
    }

    let marketData;
    try {
      // Generate market research
      marketData = await generateMarketResearch(ideaText, industry, targetRegion);

      // Log activity
      await logActivity(
        req.user._id,
        'market_research',
        `Market Research: ${ideaText.substring(0, 50)}...`,
        `Generated TAM/SAM/SOM analysis for ${industry} in ${targetRegion}`,
        marketData,
        2
      );
    } catch (opError) {
      await refundCredits(req.user._id, deduction.split, 'market_research');
      throw opError;
    }

    // Get fresh user credits
    const user = await User.findById(req.user._id);

    logger.info(`Generated market research for user ${req.user._id}`);
    res.json({
      ...marketData,
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error analyzing market:', error);
    res.status(500).json({ success: false, message: 'Failed to analyze market' });
  }
};

export default {
  analyzeMarket
};
