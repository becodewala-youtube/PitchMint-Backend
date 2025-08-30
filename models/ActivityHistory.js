const mongoose = require('mongoose');

const activityHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceType: {
    type: String,
    enum: ['idea_validation', 'competitor_analysis', 'pitch_simulator', 'market_research', 'investor_matching', 'pitch_deck', 'canvas'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  creditsUsed: {
    type: Number,
    default: 1
  },
  relatedIdeaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Idea',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ActivityHistory', activityHistorySchema);