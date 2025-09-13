const Idea = require('../models/Idea');
const User = require('../models/User');
const { validateIdea } = require('../utils/geminiApi');
const CreditTransaction = require('../models/CreditTransaction');
const { logActivity } = require('../utils/activityLogger');

// @desc    Submit a new startup idea
// @route   POST /api/idea/submit
// @access  Private
const submitStartupIdea = async (req, res) => {
  try {
    const { ideaText } = req.body;

    if (!ideaText) {
      return res.status(400).json({ message: 'Please provide your startup idea' });
    }

    // Validate the idea with Gemini API
    const validationResults = await validateIdea(ideaText);

    // Create a new idea
    const idea = await Idea.create({
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
        description: 'Used 1 credit for idea validation',
        relatedService: 'idea_validation'
      });
    }

    res.status(201).json({
      ...idea.toObject(),
      userCredits: user.credits
    });
  } catch (error) {
    console.error('Error submitting idea:', error);
    res.status(500).json({ message: error.message });
  }
};


// @desc    Get idea by ID
// @route   GET /api/idea/:id
// @access  Private
const getIdeaById = async (req, res) => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    res.json(idea);
  } catch (error) {
    console.error('Error getting idea:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all saved ideas for a user
// @route   GET /api/idea/saved
// @access  Private
const getSavedIdeas = async (req, res) => {
  try {
    const ideas = await Idea.find({ userId: req.user._id }).sort({ createdAt: -1 });

    res.json(ideas);
  } catch (error) {
    console.error('Error getting saved ideas:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete an idea
// @route   DELETE /api/idea/:id
// @access  Private
const deleteIdea = async (req, res) => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this idea' });
    }

    // Remove the idea from user's saved ideas
    await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { savedIdeas: idea._id } }
    );

    await idea.deleteOne();

    res.json({ message: 'Idea removed' });
  } catch (error) {
    console.error('Error deleting idea:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  submitStartupIdea,
  getIdeaById,
  getSavedIdeas,
  deleteIdea
};