import mongoose from 'mongoose';
import Investor from '../../src/modules/investors/investor.model';
import { InvestorType } from '../../src/modules/investors/investor.types';
import env from '../../src/config/env';

interface SeedInvestor {
  name: string;
  type: InvestorType;
  industryFocus: string[];
  description: string;
  location: string;
  contactLink: string;
  investmentRange: {
    min: number;
    max: number;
  };
}

const investors: SeedInvestor[] = [
  {
    name: 'Sequoia Capital',
    type: 'VC',
    industryFocus: ['Technology', 'Healthcare', 'Enterprise'],
    description: 'Leading venture capital firm focused on technology and healthcare sectors',
    location: 'Global',
    contactLink: 'https://www.sequoiacap.com/contact',
    investmentRange: {
      min: 1000000,
      max: 10000000
    }
  },
  {
    name: 'Y Combinator',
    type: 'Accelerator',
    industryFocus: ['Technology', 'Enterprise', 'E-commerce'],
    description: 'Premier startup accelerator program providing seed funding and mentorship',
    location: 'Silicon Valley',
    contactLink: 'https://www.ycombinator.com/contact',
    investmentRange: {
      min: 125000,
      max: 500000
    }
  },
  {
    name: 'Andreessen Horowitz',
    type: 'VC',
    industryFocus: ['Technology', 'Finance', 'Enterprise'],
    description: 'Venture capital firm backing bold entrepreneurs building the future',
    location: 'Silicon Valley',
    contactLink: 'https://a16z.com/contact',
    investmentRange: {
      min: 2000000,
      max: 20000000
    }
  },
  {
    name: 'TechStars',
    type: 'Accelerator',
    industryFocus: ['Technology', 'E-commerce', 'Enterprise'],
    description: 'Global accelerator helping entrepreneurs succeed through mentorship and funding',
    location: 'Global',
    contactLink: 'https://www.techstars.com/contact',
    investmentRange: {
      min: 100000,
      max: 300000
    }
  },
  {
    name: 'Angel List',
    type: 'Angel',
    industryFocus: ['Technology', 'Finance', 'Healthcare'],
    description: 'Platform connecting startups with angel investors',
    location: 'Global',
    contactLink: 'https://angel.co/contact',
    investmentRange: {
      min: 50000,
      max: 500000
    }
  }
];

export const seedInvestors = async (): Promise<void> => {
  try {
    const mongoUri = env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in environment');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    await Investor.deleteMany({});
    console.log('Cleared existing investors');

    const createdInvestors = await Investor.insertMany(investors);
    console.log(`Added ${createdInvestors.length} investors`);

    await mongoose.connection.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error seeding investors:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  seedInvestors();
}

export default seedInvestors;
