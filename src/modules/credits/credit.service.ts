import crypto from 'crypto';
import User from '../users/user.model';
import CreditTransaction from './credit.model';
import razorpay from '../../shared/integrations/razorpay/razorpay.client';
import { CREDIT_PLANS, CreditPlan } from '../../shared/constants/credit-plans';
import env from '../../config/env';
import logger from '../../config/logger';

export class CreditService {
  getPlans(): Record<string, CreditPlan> {
    return CREDIT_PLANS;
  }

  async getHistory(userId: string, page: number = 1, limit: number = 10) {
    const transactions = await CreditTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const total = await CreditTransaction.countDocuments({ userId });

    return {
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    };
  }

  async getBalance(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    if (typeof user.resetMonthlyCredits === 'function') {
      user.resetMonthlyCredits();
      await user.save();
    }

    return {
      credits: user.credits || 0,
      plan: user.plan || 'free',
      lastReset: user.lastCreditReset || null
    };
  }
}

export const creditService = new CreditService();
export default creditService;
