const ActivityHistory = require('../models/ActivityHistory');

const logActivity = async (userId, serviceType, title, description, data, creditsUsed = 1, relatedIdeaId = null) => {
  try {
    await ActivityHistory.create({
      userId,
      serviceType,
      title,
      description,
      data,
      creditsUsed,
      relatedIdeaId
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

module.exports = { logActivity };