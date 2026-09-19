import { Request, Response } from 'express';
import Idea from '../ideas/idea.model';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import { generateCompetitorAnalysis } from '../../shared/integrations/gemini/gemini.client';
import logger from '../../config/logger';
import { logActivity } from '../../shared/utils/activity-logger';
import { atomicDeductCredits, refundCredits } from '../../shared/middleware/credit.middleware';

export const analyzeCompetitors = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { regenerate } = req.body;
    
    const idea = await Idea.findById(id);

    if (!idea) {
      return res.status(404).json({ success: false, message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this idea' });
    }

    // If regenerate is false and we have existing analysis, return it
    if (!regenerate && idea.competitorAnalysis) {
      return res.json({ competitorAnalysis: idea.competitorAnalysis });
    }

    // Atomically deduct credits before external API call
    const deduction = await atomicDeductCredits(req.user._id, 1, 'competitor_analysis');
    if (!deduction.success) {
      return res.status(402).json({ success: false, message: 'Insufficient credits' });
    }

    let analysis;
    try {
      // Generate new analysis
      analysis = await generateCompetitorAnalysis(idea.ideaText);
      
      // Save the analysis to the database
      idea.competitorAnalysis = analysis;
      await idea.save();

      // Log activity
      await logActivity(
        req.user._id,
        'competitor_analysis',
        `Competitor Analysis: ${idea.ideaText.substring(0, 50)}...`,
        'Generated comprehensive competitor analysis with SWOT analysis',
        analysis,
        1,
        idea._id
      );
    } catch (opError) {
      await refundCredits(req.user._id, deduction.split, 'competitor_analysis');
      throw opError;
    }

    // Get fresh user credits
    const user = await User.findById(req.user._id);
    
    res.json({ 
      competitorAnalysis: analysis,
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error analyzing competitors:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const analyzeCompetitorsRandom = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ideaText } = req.body;

    if (!ideaText) {
      return res.status(400).json({ success: false, message: 'Please provide your startup idea' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    // Atomically deduct credits before external API call
    const deduction = await atomicDeductCredits(req.user._id, 1, 'competitor_analysis');
    if (!deduction.success) {
      return res.status(402).json({ success: false, message: 'Insufficient credits' });
    }

    let analysis;
    try {
      analysis = await generateCompetitorAnalysis(ideaText);
    } catch (apiError) {
      await refundCredits(req.user._id, deduction.split, 'competitor_analysis');
      throw apiError;
    }

    // Log activity for random competitor analysis
    await logActivity(
      req.user._id,
      'competitor_analysis',
      `Competitor Analysis (Ad-hoc): ${ideaText.substring(0, 50)}...`,
      'Generated competitor analysis with SWOT for standalone idea',
      analysis,
      1,
      null
    );

    // Get fresh user credits
    const user = await User.findById(req.user._id);
    
    res.json({ 
      ...analysis,
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error analyzing competitors:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  analyzeCompetitors,
  analyzeCompetitorsRandom
};
