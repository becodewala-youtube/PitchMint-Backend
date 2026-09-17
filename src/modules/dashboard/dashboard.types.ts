import { Document, Types } from 'mongoose';

export type ServiceType = 
  | 'idea_validation' 
  | 'competitor_analysis' 
  | 'pitch_simulator' 
  | 'market_research' 
  | 'investor_matching' 
  | 'pitch_deck' 
  | 'canvas';

export interface IActivityHistory extends Document {
  userId: Types.ObjectId;
  serviceType: ServiceType;
  title: string;
  description: string;
  data: any;
  creditsUsed: number;
  relatedIdeaId?: Types.ObjectId | null;
  createdAt: Date;
}
