import { Document } from 'mongoose';

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

export interface InvestorCriteria {
  industry: string;
  stage: string;
  fundingAmount: string;
  location: string;
  businessModel: string;
}
