import mongoose, { Schema, Document } from 'mongoose';

export type IdempotencyStatus = 'in_progress' | 'completed' | 'failed';

export interface IIdempotencyRecord extends Document {
  idempotencyKey: string;
  userId: mongoose.Types.ObjectId;
  endpoint: string;
  status: IdempotencyStatus;
  requestPayloadHash?: string;
  responseStatus?: number;
  responseData?: any;
  createdAt: Date;
}

const idempotencyRecordSchema = new Schema<IIdempotencyRecord>({
  idempotencyKey: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  endpoint: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'failed'],
    default: 'in_progress',
    required: true
  },
  requestPayloadHash: {
    type: String
  },
  responseStatus: {
    type: Number
  },
  responseData: {
    type: Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // TTL 24 hours (86400 seconds)
  }
});

// Compound unique index on { userId: 1, idempotencyKey: 1 }
idempotencyRecordSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

export const IdempotencyRecord = mongoose.model<IIdempotencyRecord>('IdempotencyRecord', idempotencyRecordSchema);
export default IdempotencyRecord;
