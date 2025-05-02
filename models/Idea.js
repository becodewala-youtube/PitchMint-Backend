const mongoose = require('mongoose');

const ideaSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ideaText: {
    type: String,
    required: [true, 'Please add your startup idea'],
    trim: true
  },
  marketDemandScore: {
    type: Number,
    min: 0,
    max: 100
  },
  competitionScore: {
    type: Number,
    min: 0,
    max: 100
  },
  monetizationFeasibilityScore: {
    type: Number,
    min: 0,
    max: 100
  },
  overallScore: {
    type: Number,
    min: 0,
    max: 100
  },
  analysis: {
    marketDemand: {
      score: Number,
      text: String
    },
    competition: {
      score: Number,
      text: String
    },
    monetization: {
      score: Number,
      text: String
    },
    overall: {
      score: Number,
      text: String
    }
  },
  pitchDeckContent: {
    problem: String,
    solution: String,
    marketSize: String,
    businessModel: String,
    competitors: String,
    goToMarket: String,
    team: String,
    financials: String,
    milestones: String,
    askAndUse: String
  },
  canvasContent: {
    problem: String,
    solution: String,
    keyMetrics: String,
    uniqueValueProposition: String,
    channels: String,
    customerSegments: String,
    costStructure: String,
    revenueStreams: String,
    unfairAdvantage: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Calculate overall score before saving
ideaSchema.pre('save', function(next) {
  if (this.marketDemandScore && this.competitionScore && this.monetizationFeasibilityScore) {
    this.overallScore = Math.round(
      (this.marketDemandScore + this.competitionScore + this.monetizationFeasibilityScore) / 3
    );
  }
  next();
});

module.exports = mongoose.model('Idea', ideaSchema);