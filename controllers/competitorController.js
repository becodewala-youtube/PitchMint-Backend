// backend/controllers/competitorController.js
const Idea = require('../models/Idea');
const { generateCompetitorAnalysis } = require('../utils/geminiApi');
const logger = require('../utils/logger');

const analyzeCompetitors = async (req, res) => {
  try {
    const { id } = req.params;
    const idea = await Idea.findById(id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    const analysis = await generateCompetitorAnalysis(idea.ideaText);
    
    // Save the analysis to the database
    idea.competitorAnalysis = analysis;
    await idea.save();
    
    res.json(idea);
  } catch (error) {
    logger.error('Error analyzing competitors:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  analyzeCompetitors
};
