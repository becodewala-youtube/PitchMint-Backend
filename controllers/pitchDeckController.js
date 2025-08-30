const Idea = require('../models/Idea');
const User = require('../models/User');
const { generatePitchDeck } = require('../utils/geminiApi');
const { generateTalkingPoints } = require('../utils/geminiApi');
const logger = require('../utils/logger');
const CreditTransaction = require('../models/CreditTransaction');

// @desc    Generate a pitch deck for an idea
// @route   POST /api/pitchdeck/:id
// @access  Private
const generatePitchDeckForIdea = async (req, res) => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // Generate pitch deck
    const pitchDeckContent = await generatePitchDeck(idea.ideaText, idea.analysis);
    
    // Update idea with pitch deck content
    idea.pitchDeckContent = pitchDeckContent;
    await idea.save();

    // CRITICAL FIX: Deduct credits from database
    const user = await User.findById(req.user._id);
    if (user.credits >= 1) {
      user.credits = Math.max(0, user.credits - 1);
      await user.save();

      // Record transaction
      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -1,
        description: 'Used 1 credit for pitch deck generation',
        relatedService: 'pitch_deck'
      });
    }

    logger.info(`Generated pitch deck for idea ${idea._id}`);
    res.json({
      ...idea.toObject(),
      userCredits: user.credits
    });
  } catch (error) {
    logger.error('Error generating pitch deck:', error);
    res.status(500).json({ message: 'Failed to generate pitch deck' });
  }
};

// @desc    Generate talking points for a slide
// @route   POST /api/pitchdeck/talking-points/:id
// @access  Private
const generateTalkingPointsForSlide = async (req, res) => {
  try {
    const { slideIndex = 0 } = req.body;
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    if (!idea.pitchDeckContent) {
      return res.status(400).json({ message: 'No pitch deck content available' });
    }

    const slides = [
      { title: 'Problem', content: idea.pitchDeckContent.problem },
      { title: 'Solution', content: idea.pitchDeckContent.solution },
      { title: 'Market Size', content: idea.pitchDeckContent.marketSize },
      { title: 'Business Model', content: idea.pitchDeckContent.businessModel },
      { title: 'Competition', content: idea.pitchDeckContent.competitors },
      { title: 'Go-to-Market Strategy', content: idea.pitchDeckContent.goToMarket },
      { title: 'Team', content: idea.pitchDeckContent.team },
      { title: 'Financials', content: idea.pitchDeckContent.financials },
      { title: 'Milestones', content: idea.pitchDeckContent.milestones },
      { title: 'Ask & Use of Funds', content: idea.pitchDeckContent.askAndUse }
    ];

    const currentSlide = slides[slideIndex] || slides[0];
    const talkingPoints = await generateTalkingPoints(currentSlide.content, currentSlide.title);

    res.json({ talkingPoints });
  } catch (error) {
    logger.error('Error generating talking points:', error);
    res.status(500).json({ message: 'Failed to generate talking points' });
  }
};

// @desc    Regenerate a pitch deck for an idea
// @route   PUT /api/pitchdeck/:id
// @access  Private
const regeneratePitchDeck = async (req, res) => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // Generate new pitch deck
    const pitchDeckContent = await generatePitchDeck(idea.ideaText, idea.analysis);
    
    // Update idea with new pitch deck content
    idea.pitchDeckContent = pitchDeckContent;
    await idea.save();

    // Get updated user with current credits
    const updatedUser = await User.findById(req.user._id);

    logger.info(`Regenerated pitch deck for idea ${idea._id}`);
    res.json({
      ...idea.toObject(),
      userCredits: updatedUser.credits
    });
  } catch (error) {
    logger.error('Error regenerating pitch deck:', error);
    res.status(500).json({ message: 'Failed to regenerate pitch deck' });
  }
};

module.exports = {
  generatePitchDeckForIdea,
  regeneratePitchDeck,
  generateTalkingPointsForSlide
};