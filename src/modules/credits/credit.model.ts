import mongoose, { Schema } from 'mongoose';
import { ICreditTransaction } from './credit.types';

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
