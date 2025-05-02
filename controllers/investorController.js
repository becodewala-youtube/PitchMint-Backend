const Investor = require('../models/Investor');

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

module.exports = {
  getInvestors,
  getInvestorById
};