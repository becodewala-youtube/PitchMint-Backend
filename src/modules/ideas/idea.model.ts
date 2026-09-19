import mongoose, { Schema } from 'mongoose';
import { IIdea } from './idea.types';

const ideaSchema = new Schema<IIdea>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
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
  competitorAnalysis: {
    summary: String,
    competitors: [{
      name: String,
      description: String,
      swot: {
        strengths: [String],
        weaknesses: [String],
        opportunities: [String],
        threats: [String]
      }
    }]
  },
  pitchSimulation: {
    questions: [{
      id: String,
      question: String,
      category: String,
      answer: String,
      feedback: {
        rating: Number,
        strengths: [String],
        improvements: [String],
        additionalAdvice: String
      }
    }]
  },
  collaborativeData: {
    comments: [{
      id: String,
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      userName: String,
      text: String,
      slideIndex: Number,
      position: { x: Number, y: Number },
      createdAt: { type: Date, default: Date.now }
    }],
    talkingPoints: [{
      slideIndex: Number,
      slideTitle: String,
      points: [String],
      createdAt: { type: Date, default: Date.now }
    }],
    lastModified: { type: Date, default: Date.now }
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

export const Idea = mongoose.model<IIdea>('Idea', ideaSchema);
export default Idea;
