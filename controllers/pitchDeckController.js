const Idea = require('../models/Idea');
const User = require('../models/User');
const { generatePitchDeck } = require('../utils/geminiApi');
const logger = require('../utils/logger');

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
  regeneratePitchDeck
};