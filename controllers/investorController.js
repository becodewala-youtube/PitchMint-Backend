const Investor = require('../models/Investor');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const { matchInvestors: aiMatchInvestors } = require('../utils/geminiApi');
const logger = require('../utils/logger');

// @desc    Get all investors
// @route   GET /api/investors
// @access  Private/Premium
const getInvestors = async (req, res) => {
  try {
    // Get query parameters for filtering
    const { type, industry } = req.query;
    
    let query = {};
    
    // Add filters if provided
    if (type) {
      query.type = type;
    }
    
    if (industry) {
      query.industryFocus = { $in: [industry] };
    }
    
    const investors = await Investor.find(query).sort({ name: 1 });
    
    res.json(investors);
  } catch (error) {
    console.error('Error getting investors:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get investor by ID
// @route   GET /api/investors/:id
// @access  Private/Premium
const getInvestorById = async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id);
    
    if (!investor) {
      return res.status(404).json({ message: 'Investor not found' });
    }
    
    res.json(investor);
  } catch (error) {
    console.error('Error getting investor:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Match investors based on startup criteria
// @route   POST /api/investors/match
// @access  Private/Premium
const matchInvestors = async (req, res) => {
  try {
    const criteria = req.body;
    
    // Generate AI-powered investor matches
    const matches = await aiMatchInvestors(criteria);
    
    // Deduct credits from database
    const user = await User.findById(req.user._id);
    if (user.credits >= 2) {
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
    
    logger.info(`Generated investor matches for user ${user._id}`);
    res.json({
      matches,
      userCredits: user.credits
    });
  } catch (error) {
    logger.error('Error matching investors:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getInvestors,
  getInvestorById,
  matchInvestors
};