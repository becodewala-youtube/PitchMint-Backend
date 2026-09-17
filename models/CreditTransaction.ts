import mongoose, { Document, Schema, Types } from 'mongoose';

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

const creditTransactionSchema = new Schema<ICreditTransaction>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['purchase', 'usage', 'refund', 'bonus'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  relatedService: {
    type: String,
    enum: ['idea_validation', 'pitch_deck', 'canvas', 'competitor_analysis', 'pitch_simulator', 'market_research', 'investor_matching'],
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const CreditTransaction = mongoose.model<ICreditTransaction>('CreditTransaction', creditTransactionSchema);
export default CreditTransaction;
