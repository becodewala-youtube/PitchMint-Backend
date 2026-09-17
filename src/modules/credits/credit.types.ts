import { Document, Types } from 'mongoose';

export type CreditTransactionType = 'purchase' | 'usage' | 'refund' | 'bonus';

export type RelatedService = 
  | 'idea_validation' 
  | 'pitch_deck' 
  | 'canvas' 
  | 'competitor_analysis' 
  | 'pitch_simulator' 
  | 'market_research' 
  | 'investor_matching' 
  | null;

export interface ICreditTransaction extends Document {
  userId: Types.ObjectId;
  type: CreditTransactionType;
  amount: number;
  description: string;
  relatedService?: RelatedService;
  razorpayPaymentId?: string | null;
  razorpayOrderId?: string | null;
  createdAt: Date;
}
