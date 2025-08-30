const ActivityHistory = require('../models/ActivityHistory');

// @desc    Get user activity history
// @route   GET /api/history
// @access  Private
const getActivityHistory = async (req, res) => {
  try {
    const { serviceType, page = 1, limit = 20 } = req.query;
    
    let query = { userId: req.user._id };
    
    if (serviceType && serviceType !== 'all') {
      query.serviceType = serviceType;
    }
    
    const activities = await ActivityHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ActivityHistory.countDocuments(query);

    res.json(activities);
  } catch (error) {
    console.error('Error getting activity history:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getActivityHistory
};