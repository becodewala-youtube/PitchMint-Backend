import { Request, Response } from 'express';
import Idea from './idea.model';
import User from '../users/user.model';
import { validateIdea } from '../../shared/integrations/gemini/gemini.client';
import CreditTransaction from '../credits/credit.model';
import { logActivity } from '../../shared/utils/activity-logger';
import { atomicDeductCredits, refundCredits } from '../../shared/middleware/credit.middleware';

// @desc    Submit a new startup idea
// @route   POST /api/idea/submit
// @access  Private
export const submitStartupIdea = async (req: Request, res: Response): Promise<any> => {
  try {
    const { ideaText } = req.body;

    if (!ideaText) {
      return res.status(400).json({ success: false, message: 'Please provide your startup idea' });
    }

    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    // Atomically deduct credits before external API call
    const deduction = await atomicDeductCredits(req.user._id, 1, 'idea_validation');
    if (!deduction.success) {
      return res.status(402).json({ success: false, message: 'Insufficient credits' });
    }

    let idea: any;
    let validationResults: any;
    try {
      // Validate the idea with Gemini API
      validationResults = await validateIdea(ideaText);

      // Create a new idea
      idea = await Idea.create({
        userId: req.user._id,
        ideaText,
        marketDemandScore: validationResults.marketDemandScore,
        competitionScore: validationResults.competitionScore,
        monetizationFeasibilityScore: validationResults.monetizationFeasibilityScore,
        overallScore: validationResults.overallScore,
        analysis: validationResults.analysis
      });

      // Log activity
      await logActivity(
        req.user._id,
        'idea_validation',
        `Idea Validation: ${ideaText.substring(0, 50)}...`,
        'Generated comprehensive startup idea analysis with market demand, competition, and monetization scores',
        {
          ideaText,
          scores: {
            marketDemand: validationResults.marketDemandScore,
            competition: validationResults.competitionScore,
            monetization: validationResults.monetizationFeasibilityScore,
            overall: validationResults.overallScore
          },
          analysis: validationResults.analysis
        },
        1,
        idea._id
      );

      // Add the idea to user's saved ideas
      await User.findByIdAndUpdate(
        req.user._id,
        { $push: { savedIdeas: idea._id } }
      );
    } catch (opError) {
      // Refund if the AI call or database persistence fails
      await refundCredits(req.user._id, deduction.split, 'idea_validation');
      throw opError;
    }

    // Get fresh user credits to return
    const user = await User.findById(req.user._id);

    res.status(201).json({
      ...idea.toObject(),
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    console.error('Error submitting idea:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get idea by ID
// @route   GET /api/idea/:id
// @access  Private
export const getIdeaById = async (req: Request, res: Response): Promise<any> => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ success: false, message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this idea' });
    }

    res.json(idea);
  } catch (error: any) {
    console.error('Error getting idea:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all saved ideas for a user
// @route   GET /api/idea/saved
// @access  Private
export const getSavedIdeas = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const {
      page = 1,
      limit = 10,
      search,
      filter = 'all',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query as {
      page?: string | number;
      limit?: string | number;
      search?: string;
      filter?: string;
      sortBy?: string;
      sortOrder?: string;
    };

    let pageNum = parseInt(String(page), 10);
    if (isNaN(pageNum) || pageNum < 1) {
      pageNum = 1;
    }

    let limitNum = parseInt(String(limit), 10);
    if (isNaN(limitNum) || limitNum < 1) {
      limitNum = 10;
    } else if (limitNum > 50) {
      limitNum = 50;
    }

    const query: any = { userId: req.user._id };

    // Search filter with regex escaping
    if (typeof search === 'string') {
      const trimmedSearch = search.trim();
      if (trimmedSearch.length > 0) {
        const escaped = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.ideaText = { $regex: escaped, $options: 'i' };
      }
    }

    // Category / status filters
    if (filter === 'top') {
      query.overallScore = { $gte: 80 };
    } else if (filter === 'deck') {
      query['pitchDeckContent.problem'] = { $exists: true, $nin: ['', null] };
    } else if (filter === 'none') {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { 'pitchDeckContent.problem': { $exists: false } },
            { 'pitchDeckContent.problem': null },
            { 'pitchDeckContent.problem': '' }
          ]
        },
        {
          $or: [
            { 'canvasContent.problem': { $exists: false } },
            { 'canvasContent.problem': null },
            { 'canvasContent.problem': '' }
          ]
        },
        {
          $or: [
            { 'competitorAnalysis.summary': { $exists: false } },
            { 'competitorAnalysis.summary': null },
            { 'competitorAnalysis.summary': '' }
          ]
        },
        {
          $or: [
            { 'pitchSimulation.questions': { $exists: false } },
            { 'pitchSimulation.questions': null },
            { 'pitchSimulation.questions': { $size: 0 } }
          ]
        }
      ];
    }

    // Sort order & field
    const sortField = sortBy === 'overallScore' ? 'overallScore' : 'createdAt';
    const sortDirection = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
    const sortOptions: any = { [sortField]: sortDirection };

    const total = await Idea.countDocuments(query);
    const totalPages = Math.ceil(total / limitNum) || 0;

    const ideas = await Idea.find(query)
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    res.json({
      success: true,
      ideas,
      totalPages,
      currentPage: pageNum,
      total
    });
  } catch (error: any) {
    console.error('Error getting saved ideas:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete an idea
// @route   DELETE /api/idea/:id
// @access  Private
export const deleteIdea = async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ success: false, message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this idea' });
    }

    // Remove the idea from user's saved ideas
    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { savedIdeas: idea._id } }
    );

    await idea.deleteOne();

    res.json({ message: 'Idea removed' });
  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'Idea not found' });
    }
    console.error('Error deleting idea:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  submitStartupIdea,
  getIdeaById,
  getSavedIdeas,
  deleteIdea
};
