import mongoose, { Schema, Document } from 'mongoose';

export type IdempotencyStatus = 'in_progress' | 'completed' | 'failed';

export interface IIdempotencyRecord extends Document {
  idempotencyKey: string;
  userId: mongoose.Types.ObjectId;
  httpMethod: string;
  endpoint: string;
  status: IdempotencyStatus;
  requestPayloadHash?: string;
  responseStatus?: number;
  responseData?: any;
  createdAt: Date;
  expiresAt?: Date;
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
  httpMethod: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
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
    default: Date.now
  },
  expiresAt: {
    type: Date
  }
});

// Compound unique index on { userId: 1, idempotencyKey: 1 }
idempotencyRecordSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

// TTL index on expiresAt (expireAfterSeconds: 0)
// When expiresAt is undefined/null (e.g. status: 'in_progress'), MongoDB does not expire the document.
// When status is 'completed' or 'failed', expiresAt is set to now + 24 hours.
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyRecord = mongoose.model<IIdempotencyRecord>('IdempotencyRecord', idempotencyRecordSchema);
export default IdempotencyRecord;
