import mongoose, { Schema } from 'mongoose';
import { IInvestor } from './investor.types';

const investorSchema = new Schema<IInvestor>({
  name: {
    type: String,
    required: [true, 'Please add investor name'],
    trim: true
  },
  industryFocus: {
    type: [String],
    required: [true, 'Please add industry focus']
  },
  contactLink: {
    type: String,
    required: [true, 'Please add contact link']
  },
  type: {
    type: String,
    enum: ['VC', 'Angel', 'Incubator', 'Accelerator'],
    required: [true, 'Please specify investor type']
  },
  description: {
    type: String,
    required: [true, 'Please add a description']
  },
  location: {
    type: String,
    required: [true, 'Please add location']
  },
  investmentRange: {
    min: {
      type: Number
    },
    max: {
      type: Number
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const Investor = mongoose.model<IInvestor>('Investor', investorSchema);
export default Investor;
