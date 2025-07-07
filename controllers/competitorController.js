// backend/controllers/competitorController.js
const Idea = require('../models/Idea');
const User = require('../models/User');
const { generateCompetitorAnalysis } = require('../utils/geminiApi');
const logger = require('../utils/logger');

// backend/controllers/competitorController.js
const analyzeCompetitors = async (req, res) => {
  try {
    const { id } = req.params;
    const { regenerate } = req.body;
    
    const idea = await Idea.findById(id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // If regenerate is false and we have existing analysis, return it
    if (!regenerate && idea.competitorAnalysis) {
      return res.json({ competitorAnalysis: idea.competitorAnalysis });
    }

    // Generate new analysis
    const analysis = await generateCompetitorAnalysis(idea.ideaText);
    
    // Save the analysis to the database
    idea.competitorAnalysis = analysis;
    await idea.save();

    // Get updated user with current credits
    const updatedUser = await User.findById(req.user._id);
    
    res.json({ 
      competitorAnalysis: analysis,
      userCredits: updatedUser.credits
    });
  } catch (error) {
    logger.error('Error analyzing competitors:', error);
    res.status(500).json({ message: error.message });
  }
};


const analyzeCompetitorsRandom = async (req, res) => {
  try {
    const { ideaText } = req.body;

    if (!ideaText) {
      return res.status(400).json({ message: 'Please provide your startup idea' });
    }

    const analysis = await generateCompetitorAnalysis(ideaText);

    // Get updated user with current credits
    const updatedUser = await User.findById(req.user._id);
    
    res.json({
      ...analysis,
      userCredits: updatedUser.credits
    });
  } catch (error) {
    logger.error('Error analyzing competitors:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  analyzeCompetitors,
  analyzeCompetitorsRandom
};