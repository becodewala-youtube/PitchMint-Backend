import { Document, Types } from 'mongoose';

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
