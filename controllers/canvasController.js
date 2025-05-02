const Idea = require('../models/Idea');
const { generateCanvas } = require('../utils/geminiApi');
const logger = require('../utils/logger');

// @desc    Generate a business model canvas for an idea
// @route   POST /api/canvas/:id
// @access  Private
const generateCanvasForIdea = async (req, res) => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // Generate canvas
    const canvasContent = await generateCanvas(idea.ideaText, idea.analysis);
    
    // Update idea with canvas content
    idea.canvasContent = canvasContent;
    await idea.save();

    logger.info(`Generated canvas for idea ${idea._id}`);
    res.json(idea);
  } catch (error) {
    logger.error('Error generating canvas:', error);
    res.status(500).json({ message: 'Failed to generate canvas' });
  }
};

// @desc    Regenerate a canvas for an idea
// @route   PUT /api/canvas/:id
// @access  Private
const regenerateCanvas = async (req, res) => {
  try {
    const idea = await Idea.findById(req.params.id);

    if (!idea) {
      return res.status(404).json({ message: 'Idea not found' });
    }

    // Check if the idea belongs to the user
    if (idea.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this idea' });
    }

    // Generate new canvas
    const canvasContent = await generateCanvas(idea.ideaText, idea.analysis);
    
    // Update idea with new canvas content
    idea.canvasContent = canvasContent;
    await idea.save();

    logger.info(`Regenerated canvas for idea ${idea._id}`);
    res.json(idea);
  } catch (error) {
    logger.error('Error regenerating canvas:', error);
    res.status(500).json({ message: 'Failed to regenerate canvas' });
  }
};

module.exports = {
  generateCanvasForIdea,
  regenerateCanvas
};