const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const { generateMarketResearch } = require('../utils/geminiApi');
const logger = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');

// @desc    Analyze market for startup idea
// @route   POST /api/market-research/analyze
// @access  Private
const analyzeMarket = async (req, res) => {
  try {
    const { ideaText, industry, targetRegion } = req.body;

    if (!ideaText || !industry || !targetRegion) {
      return res.status(400).json({ 
        message: 'Please provide startup idea, industry, and target region' 
      });
    }

    // Generate market research
    const marketData = await generateMarketResearch(ideaText, industry, targetRegion);

    // Log activity
    await logActivity(
      req.user._id,
      'market_research',
      `Market Research: ${ideaText.substring(0, 50)}...`,
      `Generated TAM/SAM/SOM analysis for ${industry} in ${targetRegion}`,
      marketData,
      2
    );
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
        description: 'Used 2 credits for market research analysis',
        relatedService: 'market_research'
      });
    }

    logger.info(`Generated market research for user ${user._id}`);
    res.json({
      ...marketData,
      userCredits: user.credits
    });
  } catch (error) {
    logger.error('Error analyzing market:', error);
    res.status(500).json({ message: 'Failed to analyze market' });
  }
};

module.exports = {
  analyzeMarket
};