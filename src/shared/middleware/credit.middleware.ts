import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import User from '../../modules/users/user.model';
import CreditTransaction from '../../modules/credits/credit.model';
import { RelatedService } from '../../modules/credits/credit.types';
import logger from '../../config/logger';

// Check if user has enough credits (does not deduct)
export const checkCredits = (requiredCredits: number = 1) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      if (!req.user?._id) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const user = await User.findById(req.user._id);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // We will skip user.save() here if monthly credits aren't actually reset to avoid redundant writes.
      // This addresses the unnecessary database write issue.
      if (typeof user.checkAndResetMonthlyCredits === 'function') {
        await user.checkAndResetMonthlyCredits();
      }

      // Check if user has enough credits
      if (user.credits < requiredCredits) {
        return res.status(402).json({ 
          message: 'Insufficient credits',
          creditsRequired: requiredCredits,
          creditsAvailable: user.credits,
          needsUpgrade: true
        });
      }

      // Store the fresh user data in req for next middleware
      req.user = user;
      next();
    } catch (error) {
      console.error('Credit check error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};

export interface DeductionSplit {
  monthly: number;
  purchased: number;
}

export interface DeductionResult {
  success: boolean;
  monthly: number;
  purchased: number;
  split: DeductionSplit;
}

export type RefundPoolSplit = {
  monthly?: number;
  purchased?: number;
  split?: DeductionSplit;
};

/**
 * Atomically deduct credits with cascading priority (monthly first, purchased remainder).
 * Returns exact deduction split { monthly, purchased } and preserves zero mutation on failure.
 * If ledger creation fails, automatically compensates user balances to avoid charging without service.
 */
export const atomicDeductCredits = async (
  userId: string | any,
  amount: number,
  service: RelatedService
): Promise<DeductionResult> => {
  const beforeUser = await User.findOneAndUpdate(
    {
      _id: userId,
      // Ensure TOTAL credits are sufficient
      $expr: {
        $gte: [
          {
            $add: [
              { $ifNull: ["$monthlyCredits", 0] },
              { $ifNull: ["$purchasedCredits", 0] }
            ]
          },
          amount
        ]
      }
    },
    [
      {
        $set: {
          monthlyCredits: {
            $cond: [
              { $gte: [{ $ifNull: ["$monthlyCredits", 0] }, amount] },
              { $subtract: [{ $ifNull: ["$monthlyCredits", 0] }, amount] },
              0
            ]
          },
          purchasedCredits: {
            $cond: [
              { $gte: [{ $ifNull: ["$monthlyCredits", 0] }, amount] },
              { $ifNull: ["$purchasedCredits", 0] },
              {
                $subtract: [
                  { $ifNull: ["$purchasedCredits", 0] },
                  { $subtract: [amount, { $ifNull: ["$monthlyCredits", 0] }] }
                ]
              }
            ]
          }
        }
      }
    ],
    { new: false }
  );

  if (!beforeUser) {
    return {
      success: false,
      monthly: 0,
      purchased: 0,
      split: { monthly: 0, purchased: 0 }
    };
  }

  const beforeMonthly = beforeUser.monthlyCredits ?? 0;
  const deductedFromMonthly = Math.min(beforeMonthly, amount);
  const deductedFromPurchased = amount - deductedFromMonthly;

  const split: DeductionSplit = {
    monthly: deductedFromMonthly,
    purchased: deductedFromPurchased
  };

  // Record transaction with exact deductedFrom ledger details
  try {
    await CreditTransaction.create({
      userId,
      type: 'usage',
      amount: -amount,
      description: `Used ${amount} credit(s) for ${service}`,
      deductedFrom: split,
      relatedService: service
    });
  } catch (txnError: any) {
    logger.error('Credit ledger creation failed after deduction. Compensating user balances:', txnError);
    // Compensate: rollback the deduction to exact pools so user is never permanently charged without service
    try {
      const rollbackInc: Record<string, number> = {};
      if (deductedFromMonthly > 0) rollbackInc.monthlyCredits = deductedFromMonthly;
      if (deductedFromPurchased > 0) rollbackInc.purchasedCredits = deductedFromPurchased;
      if (Object.keys(rollbackInc).length > 0) {
        await User.updateOne({ _id: userId }, { $inc: rollbackInc });
      }
    } catch (compensateError) {
      logger.error('CRITICAL: Failed to compensate credit deduction after ledger failure:', compensateError);
    }

    return {
      success: false,
      monthly: 0,
      purchased: 0,
      split: { monthly: 0, purchased: 0 }
    };
  }

  return {
    success: true,
    monthly: deductedFromMonthly,
    purchased: deductedFromPurchased,
    split
  };
};

/**
 * Atomically and idempotently refund credits to their exact originating pools.
 * Does NOT convert monthly credits into purchased credits.
 * Uses processedRefunds array and sparse unique index on CreditTransaction for permanent
 * idempotency and crash recovery, mirroring the payment architecture.
 */
export const refundCredits = async (
  userId: string | any,
  amountOrSplit: number | RefundPoolSplit,
  service: RelatedService,
  refundId?: string
): Promise<{ success: boolean; alreadyProcessed?: boolean }> => {
  const effectiveRefundId = refundId || `ref_${crypto.randomUUID()}`;

  const split: DeductionSplit = typeof amountOrSplit === 'number'
    ? { monthly: 0, purchased: amountOrSplit }
    : {
        monthly: amountOrSplit.split?.monthly ?? amountOrSplit.monthly ?? 0,
        purchased: amountOrSplit.split?.purchased ?? amountOrSplit.purchased ?? 0
      };

  const totalAmount = split.monthly + split.purchased;

  const incOps: Record<string, number> = {};
  if (split.monthly > 0) incOps.monthlyCredits = split.monthly;
  if (split.purchased > 0) incOps.purchasedCredits = split.purchased;

  const updateOps: any = {
    $push: { processedRefunds: effectiveRefundId }
  };
  if (Object.keys(incOps).length > 0) {
    updateOps.$inc = incOps;
  }

  // Idempotently increment credit pools only if effectiveRefundId hasn't been processed
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, processedRefunds: { $ne: effectiveRefundId } },
    updateOps,
    { new: true }
  );

  if (!updatedUser) {
    // Check if user exists and already processed this refund
    const userExists = await User.findById(userId);
    if (userExists && userExists.processedRefunds?.includes(effectiveRefundId)) {
      logger.info(`Refund ${effectiveRefundId} already processed for user ${userId}`);

      // RECOVERY FOR P3 LEDGER DESYNCHRONIZATION:
      // If User was updated but CreditTransaction failed or process crashed before writing ledger,
      // recover the missing ledger entry.
      try {
        const existingTxn = await CreditTransaction.findOne({ refundId: effectiveRefundId });
        if (!existingTxn) {
          logger.info(`Recovering missing refund transaction log for ${effectiveRefundId}`);
          await CreditTransaction.create({
            userId,
            type: 'refund',
            amount: totalAmount,
            description: `Refunded ${totalAmount} credit(s) for failed ${service}`,
            deductedFrom: {
              monthly: split.monthly,
              purchased: split.purchased
            },
            relatedService: service,
            refundId: effectiveRefundId
          });
        }
      } catch (recoveryErr: any) {
        if (recoveryErr.code !== 11000) {
          logger.error('Error recovering refund transaction log:', recoveryErr);
        }
      }

      return { success: true, alreadyProcessed: true };
    }

    logger.error(`User ${userId} not found during refund processing`);
    return { success: false };
  }

  // Record refund transaction log
  try {
    await CreditTransaction.create({
      userId,
      type: 'refund',
      amount: totalAmount,
      description: `Refunded ${totalAmount} credit(s) for failed ${service}`,
      deductedFrom: {
        monthly: split.monthly,
        purchased: split.purchased
      },
      relatedService: service,
      refundId: effectiveRefundId
    });
  } catch (txnError: any) {
    if (txnError.code === 11000) {
      logger.info(`Refund ledger for ${effectiveRefundId} safely created by concurrent request.`);
    } else {
      logger.error('Error creating refund transaction log:', txnError);
    }
  }

  return { success: true, alreadyProcessed: false };
};

export default {
  checkCredits,
  atomicDeductCredits,
  refundCredits
};
