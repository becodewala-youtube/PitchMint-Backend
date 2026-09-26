import { Request, Response } from 'express';
import Idea from '../ideas/idea.model';
import User from '../users/user.model';
import { generatePitchDeck, generateTalkingPoints } from '../../shared/integrations/gemini/gemini.client';
import logger from '../../config/logger';
import { atomicDeductCredits, refundCredits } from '../../shared/middleware/credit.middleware';

// @desc    Generate a pitch deck for an idea
// @route   POST /api/pitchdeck/:id
// @access  Private
export const generatePitchDeckForIdea = async (req: Request, res: Response): Promise<any> => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ success: false, message: 'Idea not found' });
    }

    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this idea' });
    }

    // Atomically deduct credits before external API call
    const deduction = await atomicDeductCredits(req.user._id, 1, 'pitch_deck');
    if (!deduction.success) {
      return res.status(402).json({ success: false, message: 'Insufficient credits' });
    }

    try {
      // Generate pitch deck
      const pitchDeckContent = await generatePitchDeck(idea.ideaText, idea.analysis);
      
      // Update idea with pitch deck content
      idea.pitchDeckContent = pitchDeckContent;
      await idea.save();
    } catch (opError) {
      await refundCredits(req.user._id, deduction.split, 'pitch_deck');
      throw opError;
    }

    // Get fresh user credits
    const userQuery = User.findById(req.user._id);
    const user = userQuery && typeof (userQuery as any).select === 'function'
      ? await (userQuery as any).select('credits monthlyCredits purchasedCredits')
      : await userQuery;

    logger.info(`Generated pitch deck for idea ${idea._id}`);
    res.json({
      ...idea.toObject(),
      userCredits: user ? user.credits : 0
    });
  } catch (error: any) {
    logger.error('Error generating pitch deck:', error);
    res.status(500).json({ success: false, message: 'Failed to generate pitch deck' });
  }
};

// @desc    Generate talking points for a slide
// @route   POST /api/pitchdeck/talking-points/:id
// @access  Private
export const generateTalkingPointsForSlide = async (req: Request, res: Response): Promise<any> => {
  try {
    const { slideIndex = 0 } = req.body;
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ success: false, message: 'Idea not found' });
    }

    if (idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this idea' });
    }

    if (!idea.pitchDeckContent) {
      return res.status(400).json({ success: false, message: 'No pitch deck content available' });
    }

    const slides = [
      { title: 'Problem', content: idea.pitchDeckContent.problem || '' },
      { title: 'Solution', content: idea.pitchDeckContent.solution || '' },
      { title: 'Market Size', content: idea.pitchDeckContent.marketSize || '' },
      { title: 'Business Model', content: idea.pitchDeckContent.businessModel || '' },
      { title: 'Competition', content: idea.pitchDeckContent.competitors || '' },
      { title: 'Go-to-Market Strategy', content: idea.pitchDeckContent.goToMarket || '' },
      { title: 'Team', content: idea.pitchDeckContent.team || '' },
      { title: 'Financials', content: idea.pitchDeckContent.financials || '' },
      { title: 'Milestones', content: idea.pitchDeckContent.milestones || '' },
      { title: 'Ask & Use of Funds', content: idea.pitchDeckContent.askAndUse || '' }
    ];

    const currentSlide = slides[slideIndex] || slides[0];
    const talkingPoints = await generateTalkingPoints(currentSlide.content, currentSlide.title);

    // Save talking points to database
    if (!idea.collaborativeData) {
      idea.collaborativeData = { comments: [], talkingPoints: [], lastModified: new Date() };
    }
    
    // Update or add talking points for this slide
    const existingPointsIndex = idea.collaborativeData.talkingPoints.findIndex(tp => tp.slideIndex === slideIndex);
    const talkingPointsData = {
      slideIndex,
      slideTitle: currentSlide.title,
      points: talkingPoints,
      createdAt: new Date()
    };
    
    if (existingPointsIndex >= 0) {
      idea.collaborativeData.talkingPoints[existingPointsIndex] = talkingPointsData;
    } else {
      idea.collaborativeData.talkingPoints.push(talkingPointsData);
    }
    
    idea.collaborativeData.lastModified = new Date();
    await idea.save();
    res.json({ talkingPoints });
  } catch (error: any) {
    logger.error('Error generating talking points:', error);
    res.status(500).json({ success: false, message: 'Failed to generate talking points' });
  }
};

// @desc    Regenerate a pitch deck for an idea
// @route   PUT /api/pitchdeck/:id
// @access  Private
export const regeneratePitchDeck = async (req: Request, res: Response): Promise<any> => {
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
    const deduction = await atomicDeductCredits(req.user._id, 1, 'pitch_deck');
    if (!deduction.success) {
      return res.status(402).json({ success: false, message: 'Insufficient credits' });
    }

    try {
      // Generate new pitch deck
      const pitchDeckContent = await generatePitchDeck(idea.ideaText, idea.analysis);
      
      // Update idea with new pitch deck content
      idea.pitchDeckContent = pitchDeckContent;
      await idea.save();
    } catch (opError) {
      await refundCredits(req.user._id, deduction.split, 'pitch_deck');
      throw opError;
    }

    // Get updated user with current credits
    const updatedUser = await User.findById(req.user._id).select('credits');

    logger.info(`Regenerated pitch deck for idea ${idea._id}`);
    res.json({
      ...idea.toObject(),
      userCredits: updatedUser ? updatedUser.credits : 0
    });
  } catch (error: any) {
    logger.error('Error regenerating pitch deck:', error);
    res.status(500).json({ success: false, message: 'Failed to regenerate pitch deck' });
  }
};

// @desc    Update slide content for collaborative editing
// @route   PUT /api/pitchdeck/collaborative/:id/slide
// @access  Private
export const updateSlideContent = async (req: Request, res: Response): Promise<any> => {
  try {
    const { slideIndex, content } = req.body;
    const idea = await Idea.findById(req.params.id);

    if (!idea || idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(404).json({ success: false, message: 'Idea not found or unauthorized' });
    }

    if (!idea.pitchDeckContent) {
      return res.status(400).json({ success: false, message: 'No pitch deck content available' });
    }

    // Update the specific slide content
    const slideKeys = ['problem', 'solution', 'marketSize', 'businessModel', 'competitors', 'goToMarket', 'team', 'financials', 'milestones', 'askAndUse'];
    const slideKey = slideKeys[slideIndex];
    
    if (slideKey) {
      idea.pitchDeckContent[slideKey] = content;
      idea.markModified('pitchDeckContent');
      
      // Update collaborative data timestamp
      if (!idea.collaborativeData) {
        idea.collaborativeData = { comments: [], talkingPoints: [], lastModified: new Date() };
      }
      idea.collaborativeData.lastModified = new Date();
      
      await idea.save();
    }

    res.json({ message: 'Slide updated successfully' });
  } catch (error: any) {
    logger.error('Error updating slide:', error);
    res.status(500).json({ success: false, message: 'Failed to update slide' });
  }
};

// @desc    Add comment to pitch deck
// @route   POST /api/pitchdeck/collaborative/:id/comment
// @access  Private
export const addComment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { text, slideIndex, position } = req.body;
    const idea = await Idea.findById(req.params.id);

    if (!idea || idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(404).json({ success: false, message: 'Idea not found or unauthorized' });
    }

    if (!idea.collaborativeData) {
      idea.collaborativeData = { comments: [], talkingPoints: [], lastModified: new Date() };
    }

    const comment = {
      id: Date.now().toString(),
      userId: req.user._id,
      userName: req.user.name,
      text,
      slideIndex,
      position: position || { x: 50, y: 50 },
      createdAt: new Date()
    };

    idea.collaborativeData.comments.push(comment);
    idea.collaborativeData.lastModified = new Date();
    await idea.save();

    res.json({ comment });
  } catch (error: any) {
    logger.error('Error adding comment:', error);
    res.status(500).json({ success: false, message: 'Failed to add comment' });
  }
};

// @desc    Delete comment from pitch deck
// @route   DELETE /api/pitchdeck/collaborative/:id/comment/:commentId
// @access  Private
export const deleteComment = async (req: Request, res: Response): Promise<any> => {
  try {
    const { commentId } = req.params;
    const idea = await Idea.findById(req.params.id);

    if (!idea || idea.userId.toString() !== req.user?._id?.toString()) {
      return res.status(404).json({ success: false, message: 'Idea not found or unauthorized' });
    }

    if (idea.collaborativeData?.comments) {
      idea.collaborativeData.comments = idea.collaborativeData.comments.filter(
        comment => comment.id !== commentId
      );
      idea.collaborativeData.lastModified = new Date();
      await idea.save();
    }

    res.json({ message: 'Comment deleted successfully' });
  } catch (error: any) {
    logger.error('Error deleting comment:', error);
    res.status(500).json({ success: false, message: 'Failed to delete comment' });
  }
};

// @desc    Process voice feedback for pitch practice
// @route   POST /api/pitchdeck/voice-feedback/:id
// @access  Private
export const processVoiceFeedback = async (req: Request, res: Response): Promise<any> => {
  try {
    const audioFile = req.file;

    if (!audioFile) {
      return res.status(400).json({ success: false, message: 'No audio file provided' });
    }

    // Process audio file from memory buffer
    const audioBuffer = audioFile.buffer;
    const audioSize = audioBuffer.length;
    
    // Return mock feedback with actual file info
    const mockFeedback = {
      transcription: 'Mock transcription of your pitch practice',
      audioInfo: {
        size: `${(audioSize / 1024).toFixed(2)} KB`,
        duration: 'Estimated 30 seconds',
        format: audioFile.mimetype
      },
      feedback: {
        clarity: Math.floor(Math.random() * 20) + 80, // 80-100
        confidence: Math.floor(Math.random() * 20) + 75, // 75-95
        pace: Math.floor(Math.random() * 15) + 80, // 80-95
        suggestions: [
          'Speak slightly slower for better clarity',
          'Add more emphasis on key value propositions',
          'Include specific metrics to support claims',
          'Practice transitions between slides'
        ]
      }
    };

    res.json(mockFeedback);
  } catch (error: any) {
    logger.error('Error processing voice feedback:', error);
    res.status(500).json({ success: false, message: 'Failed to process voice feedback' });
  }
};

export default {
  generatePitchDeckForIdea,
  regeneratePitchDeck,
  generateTalkingPointsForSlide,
  updateSlideContent,
  addComment,
  deleteComment,
  processVoiceFeedback
};
