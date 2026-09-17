import { Request, Response } from 'express';
import Idea from '../ideas/idea.model';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import { generateCompetitorAnalysis } from '../../shared/integrations/gemini/gemini.client';
import logger from '../../config/logger';
import { logActivity } from '../../shared/utils/activity-logger';

export const analyzeCompetitors = async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { regenerate } = req.body;
    
    const idea = await Idea.findById(id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // If regenerate is false and we have existing analysis, return it
    if (!regenerate && idea.competitorAnalysis) {
      return res.json({ competitorAnalysis: idea.competitorAnalysis });
    }

    // Check user credits before proceeding
    const user = await User.findById(req.user._id);
    if (!user || user.credits < 1) {
      return res.status(402).json({ 
        message: 'Insufficient credits',
        creditsRequired: 1,
        creditsAvailable: user ? user.credits : 0
      });
    }

    // Generate new analysis
    const analysis = await generateCompetitorAnalysis(idea.ideaText);
    
    // Save the analysis to the database
    idea.competitorAnalysis = analysis;
    await idea.save();

    // Log activity
    await logActivity(
      user._id,
      'competitor_analysis',
      `Competitor Analysis: ${idea.ideaText.substring(0, 50)}...`,
      'Generated comprehensive competitor analysis with SWOT analysis',
      analysis,
      1,
      idea._id
    );

    // Deduct credits from database
    user.credits = Math.max(0, user.credits - 1);
    await user.save();

    // Record transaction
    await CreditTransaction.create({
      userId: user._id,
      type: 'usage',
      amount: -1,
      description: 'Used 1 credit for competitor analysis',
      relatedService: 'competitor_analysis'
    });
    
    res.json({ 
      competitorAnalysis: analysis,
      userCredits: user.credits
    });
  } catch (error: any) {
    logger.error('Error analyzing competitors:', error);
    res.status(500).json({ message: error.message });
  }
};

export const analyzeCompetitorsRandom = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ideaText } = req.body;

    if (!ideaText) {
      return res.status(400).json({ message: 'Please provide your startup idea' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const analysis = await generateCompetitorAnalysis(ideaText);

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
        description: 'Used 1 credit for competitor analysis',
        relatedService: 'competitor_analysis'
      });
    }
    
    res.json({ 
      ...analysis,
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error analyzing competitors:', error);
    res.status(500).json({ message: error.message });
  }
};

export default {
  analyzeCompetitors,
  analyzeCompetitorsRandom
};
