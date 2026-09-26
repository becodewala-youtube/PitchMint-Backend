import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import User from '../../src/modules/users/user.model';
import Idea from '../../src/modules/ideas/idea.model';
import Investor from '../../src/modules/investors/investor.model';
import { IUser } from '../../src/modules/users/user.types';
import { IIdea } from '../../src/modules/ideas/idea.types';
import { IInvestor } from '../../src/modules/investors/investor.types';
import env from '../../src/config/env';

/**
 * Creates and persists a user in the test database.
 */
export const createTestUser = async (overrides: Partial<IUser> = {}): Promise<any> => {
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const defaultUserData = {
    name: `Test User ${uniqueSuffix}`,
    email: `test_${uniqueSuffix}@example.com`,
    password: 'Password123!',
    plan: 'free' as const,
    monthlyCredits: 3,
    purchasedCredits: 0,
    isPremium: false,
    isEmailVerified: true,
    authProvider: 'local' as const,
    tokenVersion: 0,
    lastCreditReset: new Date(),
    ...overrides
  };

  return await User.create(defaultUserData);
};

/**
 * Generates a valid JWT auth token for a given user.
 */
export const createAuthToken = (userId: string | Types.ObjectId, tokenVersion: number = 0): string => {
  return jwt.sign(
    { id: userId.toString(), tokenVersion },
    env.JWT_SECRET,
    { expiresIn: '1d' }
  );
};

/**
 * Generates an Authorization header object with a valid Bearer token.
 */
export const createAuthHeader = (userId: string | Types.ObjectId, tokenVersion: number = 0): { Authorization: string } => {
  const token = createAuthToken(userId, tokenVersion);
  return { Authorization: `Bearer ${token}` };
};

/**
 * Creates and persists an Idea in the test database.
 */
export const createTestIdea = async (
  userId: string | Types.ObjectId,
  overrides: Partial<IIdea> = {}
): Promise<any> => {
  const defaultIdeaData = {
    userId,
    ideaText: 'An AI-powered B2B platform for automated inventory replenishment and supply chain optimization.',
    marketDemandScore: 85,
    competitionScore: 70,
    monetizationFeasibilityScore: 80,
    overallScore: 78,
    analysis: {
      marketDemand: { score: 85, text: 'Strong demand in logistics sector.' },
      competition: { score: 70, text: 'Moderate competition from legacy ERPs.' },
      monetization: { score: 80, text: 'SaaS subscription model with high LTV.' },
      overall: { score: 78, text: 'Solid opportunity with clear path to profitability.' }
    },
    ...overrides
  };

  return await Idea.create(defaultIdeaData);
};

/**
 * Creates and persists an Investor in the test database.
 */
export const createTestInvestor = async (overrides: Partial<IInvestor> = {}): Promise<any> => {
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const defaultInvestorData = {
    name: `Venture Capital Partners ${uniqueSuffix}`,
    type: 'VC' as const,
    industryFocus: ['Fintech', 'SaaS', 'AI'],
    stage: 'Seed',
    investmentRange: {
      min: 250000,
      max: 2000000
    },
    location: 'San Francisco, CA',
    description: 'Early stage venture firm backing software founders.',
    website: 'https://example-vc.com',
    contactLink: `https://example-vc.com/contact_${uniqueSuffix}`,
    contactEmail: `contact_${uniqueSuffix}@example-vc.com`,
    portfolioCompanies: ['Stripe', 'Twilio'],
    active: true,
    ...overrides
  };

  return await Investor.create(defaultInvestorData);
};

/**
 * Generates a valid HMAC-SHA256 signature for Razorpay payment verification.
 */
export const generatePaymentSignature = (
  orderId: string,
  paymentId: string,
  secret: string = env.RAZORPAY_KEY_SECRET || 'rzp_mock_secret'
): string => {
  const payload = `${orderId}|${paymentId}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
};

/**
 * Generates a valid HMAC-SHA256 signature for Razorpay webhook verification.
 */
export const generateWebhookSignature = (
  payload: string | Buffer,
  secret: string = env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_test_12345'
): string => {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
};

/**
 * Mock responses for Gemini AI service functions.
 */
export const mockGeminiResponses = {
  ideaValidation: {
    marketDemandScore: 88,
    competitionScore: 72,
    monetizationFeasibilityScore: 85,
    overallScore: 82,
    analysis: {
      marketDemand: { score: 88, text: 'Massive addressable market with clear pain points.' },
      competition: { score: 72, text: 'Fragmented competitors with outdated solutions.' },
      monetization: { score: 85, text: 'High willingness to pay for SaaS workflow automation.' },
      overall: { score: 82, text: 'Highly viable startup concept with strong commercial potential.' }
    }
  },
  pitchDeck: {
    problem: 'Enterprises lose millions annually due to fragmented data pipelines and manual reporting bottlenecks.',
    solution: 'An automated, AI-driven data intelligence pipeline that delivers real-time business insights.',
    marketSize: 'TAM: $50B global data integration market. SAM: $10B mid-market. SOM: $500M initial vertical focus.',
    businessModel: 'Tiered B2B SaaS pricing starting at $499/month with enterprise custom tiers.',
    competitors: 'Legacy tools like Informatica and Talend lack real-time AI automation and modern developer ergonomics.',
    goToMarket: 'Product-led growth targeting engineering leads combined with targeted outbound enterprise sales.',
    team: 'Founders have 15+ years combined experience leading engineering and product at Fortune 500 tech companies.',
    financials: 'Projected $1.2M ARR Year 1, $4.5M ARR Year 2, and $12M ARR Year 3 with 82% gross margins.',
    milestones: 'Q1: Beta launch with 10 design partners. Q2: General availability. Q3: $1M ARR milestone.',
    askAndUse: 'Raising $2M Seed round to expand engineering team (60%), scale sales & marketing (30%), and operations (10%).'
  },
  canvas: {
    problem: 'Manual inventory tracking leads to stockouts and excess holding costs for SMB retailers.',
    solution: 'Automated predictive restocking software connected directly to POS systems.',
    keyMetrics: 'Monthly active merchants, inventory turnover rate, prediction accuracy, net revenue retention.',
    uniqueValueProposition: 'Zero-configuration AI restocking that prevents stockouts within 48 hours of installation.',
    channels: 'Shopify App Store, direct outbound to retail associations, content marketing on retail ops.',
    customerSegments: 'Omnichannel retail brands with $1M-$20M annual GMV.',
    costStructure: 'Cloud infrastructure (AWS/GCP), API compute, engineering payroll, customer success.',
    revenueStreams: 'Monthly software subscription ($199-$999/month) plus 0.1% take rate on automated PO volume.',
    unfairAdvantage: 'Proprietary multi-echelon demand forecasting algorithm trained on 10M+ transaction events.'
  },
  competitorAnalysis: {
    competitors: [
      {
        name: 'Competitor Alpha',
        description: 'Legacy desktop solution with high market share but outdated interface.',
        swot: {
          strengths: ['Established brand', 'Large customer base'],
          weaknesses: ['Slow releases', 'No mobile support', 'High pricing'],
          opportunities: ['Cloud migration'],
          threats: ['Modern cloud-native startups']
        }
      },
      {
        name: 'Competitor Beta',
        description: 'Niche web app focusing exclusively on micro-businesses.',
        swot: {
          strengths: ['Low cost', 'Simple UI'],
          weaknesses: ['Limited feature set', 'No enterprise security'],
          opportunities: ['Upmarket expansion'],
          threats: ['Platform commoditization']
        }
      }
    ],
    summary: 'The competitive landscape is ripe for disruption by modern cloud platforms offering native AI automation.'
  },
  pitchSimulation: {
    questions: [
      { id: '1', question: 'How do you plan to acquire your first 100 enterprise customers?', category: 'Growth' },
      { id: '2', question: 'What is your defensible moat against well-funded incumbents?', category: 'Competition' },
      { id: '3', question: 'Explain your unit economics and payback period.', category: 'Revenue' }
    ]
  },
  pitchEvaluation: {
    feedback: {
      rating: 4,
      strengths: ['Clear articulate answer with quantitative metrics', 'Showed deep understanding of customer acquisition costs'],
      improvements: ['Elaborate more on specific sales cycles', 'Highlight retention metrics'],
      additionalAdvice: 'Lead with the customer retention rate before explaining the acquisition channel.'
    }
  },
  marketResearch: {
    tam: {
      value: 45000000000,
      description: 'Global enterprise software automation market valuation.',
      sources: ['Gartner Research 2025', 'IDC MarketScape 2024']
    },
    sam: {
      value: 6500000000,
      description: 'Serviceable addressable market in North America and Western Europe.',
      methodology: 'Calculated using mid-market company counts multiplied by average contract value.'
    },
    som: {
      value: 250000000,
      description: 'Obtainable market share within 3-5 years targeting early adopters.',
      timeline: '3-5 years'
    },
    trends: [
      { keyword: 'AI Workflow Automation', interest: 92, growth: '34% YoY' },
      { keyword: 'Real-time Supply Chain Analytics', interest: 81, growth: '22% YoY' }
    ],
    personas: [
      {
        name: 'Operations Director Sarah',
        demographics: { age: '35-48', income: '$120k-$160k', location: 'Metropolitan US', education: 'Master of Business' },
        psychographics: { values: ['Efficiency', 'Accuracy'], interests: ['Tech Innovation'], painPoints: ['Manual spreadsheets', 'Reporting delays'] },
        behaviors: { buyingHabits: 'Quarterly software evaluations', mediaConsumption: 'Industry whitepapers, LinkedIn', decisionFactors: ['ROI in 6 months', 'SOC2 compliance'] }
      }
    ],
    competitorActivity: [
      { name: 'OldGuard Corp', fundingRounds: 4, lastFunding: '$40M Series C', marketShare: '25%' }
    ]
  },
  talkingPoints: [
    'Introduce the core problem: 80% of retailers suffer from costly stockout events.',
    'Demonstrate the 10x speed improvement delivered by our autonomous algorithm.',
    'Present current traction: 25 design partners with 99.4% prediction accuracy.',
    'Explain the capital efficiency of our product-led sales motion.',
    'Close with our funding ask and the exact milestones this capital unlocks.'
  ],
  investorMatches: [
    {
      name: 'Apex Horizon Ventures',
      type: 'VC',
      industryFocus: ['Fintech', 'SaaS', 'AI'],
      description: 'Tier-1 seed fund investing in early-stage vertical enterprise SaaS.',
      location: 'San Francisco, CA',
      contactLink: 'https://apexhorizon.example.com/apply',
      investmentRange: { min: 500000, max: 2500000 },
      matchScore: 94,
      matchReasons: ['Direct thesis match for vertical SaaS', 'Active investments in logistics'],
      recentInvestments: ['ShipLogix', 'DataFlow'],
      portfolioSize: 42
    },
    {
      name: 'Founders Collective Angel Group',
      type: 'Angel',
      industryFocus: ['SaaS', 'Marketplace'],
      description: 'Operator-led syndicate supporting technical founders.',
      location: 'New York, NY',
      contactLink: 'https://founderscollective.example.com',
      investmentRange: { min: 100000, max: 500000 },
      matchScore: 87,
      matchReasons: ['Target industry aligned with syndicate leads', 'Seed-stage sweet spot'],
      recentInvestments: ['RetailSync'],
      portfolioSize: 28
    }
  ]
};
