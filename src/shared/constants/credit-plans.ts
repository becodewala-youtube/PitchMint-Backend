export interface CreditPlan {
  name: string;
  credits: number;
  price: number;
  description: string;
}

export const CREDIT_PLANS: Record<string, CreditPlan> = {
  starter: {
    name: 'Starter Pack',
    credits: 25,
    price: 9900, // ₹99.00
    description: 'Perfect for testing ideas'
  },
  pro: {
    name: 'Pro Pack',
    credits: 100,
    price: 49900, // ₹499.00
    description: 'Great for active entrepreneurs'
  },
  premium: {
    name: 'Premium Pack',
    credits: 500,
    price: 99900, // ₹999.00
    description: 'For serious startup builders'
  }
};

export default CREDIT_PLANS;
