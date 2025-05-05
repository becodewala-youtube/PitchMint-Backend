const { generateCompetitorAnalysis } = require('../utils/geminiApi');
const logger = require('../utils/logger');

const analyzeCompetitors = async (req, res) => {
  try {
    const { ideaText } = req.body;

    if (!ideaText) {
      return res.status(400).json({ message: 'Please provide your startup idea' });
    }

    const analysis = await generateCompetitorAnalysis(ideaText);
    
    res.json(analysis);
  } catch (error) {
    logger.error('Error analyzing competitors:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  analyzeCompetitors
};