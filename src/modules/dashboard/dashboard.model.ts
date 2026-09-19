import mongoose, { Schema } from 'mongoose';
import { IActivityHistory } from './dashboard.types';

const activityHistorySchema = new Schema<IActivityHistory>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
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
    type: Schema.Types.Mixed,
    required: true
  },
  creditsUsed: {
    type: Number,
    default: 1
  },
  relatedIdeaId: {
    type: Schema.Types.ObjectId,
    ref: 'Idea',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const ActivityHistory = mongoose.model<IActivityHistory>('ActivityHistory', activityHistorySchema);
export default ActivityHistory;
