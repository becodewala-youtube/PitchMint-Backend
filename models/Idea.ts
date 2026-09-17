import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IIdeaAnalysisSection {
  score?: number;
  text?: string;
}

export interface IIdeaAnalysis {
  marketDemand?: IIdeaAnalysisSection;
  competition?: IIdeaAnalysisSection;
  monetization?: IIdeaAnalysisSection;
  overall?: IIdeaAnalysisSection;
}

export interface IPitchDeckContent {
  problem?: string;
  solution?: string;
  marketSize?: string;
  businessModel?: string;
  competitors?: string;
  goToMarket?: string;
  team?: string;
  financials?: string;
  milestones?: string;
  askAndUse?: string;
  [key: string]: string | undefined;
}

export interface ICanvasContent {
  problem?: string;
  solution?: string;
  keyMetrics?: string;
  uniqueValueProposition?: string;
  channels?: string;
  customerSegments?: string;
  costStructure?: string;
  revenueStreams?: string;
  unfairAdvantage?: string;
}

export interface ICompetitorSwot {
  strengths?: string[];
  weaknesses?: string[];
  opportunities?: string[];
  threats?: string[];
}

export interface ICompetitor {
  name?: string;
  description?: string;
  swot?: ICompetitorSwot;
}

export interface ICompetitorAnalysis {
  summary?: string;
  competitors?: ICompetitor[];
}

export interface IPitchQuestionFeedback {
  rating?: number;
  strengths?: string[];
  improvements?: string[];
  additionalAdvice?: string;
}

export interface IPitchQuestion {
  id: string;
  question: string;
  category: string;
  answer?: string;
  feedback?: IPitchQuestionFeedback | null;
}

export interface ICollaborativeComment {
  id: string;
  userId: Types.ObjectId;
  userName: string;
  text: string;
  slideIndex: number;
  position: { x: number; y: number };
  createdAt: Date;
}

export interface ICollaborativeTalkingPoint {
  slideIndex: number;
  slideTitle: string;
  points: string[];
  createdAt: Date;
}

export interface ICollaborativeData {
  comments: ICollaborativeComment[];
  talkingPoints: ICollaborativeTalkingPoint[];
  lastModified: Date;
}

export interface IIdea extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  ideaText: string;
  marketDemandScore?: number;
  competitionScore?: number;
  monetizationFeasibilityScore?: number;
  overallScore?: number;
  analysis?: IIdeaAnalysis;
  pitchDeckContent?: IPitchDeckContent;
  canvasContent?: ICanvasContent;
  competitorAnalysis?: ICompetitorAnalysis;
  pitchSimulation?: {
    questions?: IPitchQuestion[];
  };
  collaborativeData?: ICollaborativeData;
  createdAt: Date;
}

const ideaSchema = new Schema<IIdea>({
  userId: {
    type: Schema.Types.ObjectId,
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
