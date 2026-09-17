import mongoose, { Document, Schema } from 'mongoose';

export type InvestorType = 'VC' | 'Angel' | 'Incubator' | 'Accelerator';

export interface IInvestor extends Document {
  name: string;
  industryFocus: string[];
  contactLink: string;
  type: InvestorType;
  description: string;
  location: string;
  investmentRange?: {
    min?: number;
    max?: number;
  };
  createdAt: Date;
}

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
