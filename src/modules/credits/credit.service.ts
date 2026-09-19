import User from '../users/user.model';
import CreditTransaction from './credit.model';
import logger from '../../config/logger';

export const processSuccessfulPayment = async (
  userId: string,
  credits: number,
  planName: string,
  paymentId: string,
  orderId: string
): Promise<{ success: boolean; user?: any; alreadyProcessed?: boolean }> => {
  // Use MongoDB $ne and $push to ensure idempotent credit updates
  // This guarantees that credits are only added once per paymentId, even if called concurrently
  // $slice: -50 is removed to ensure older payments never replay and cause duplicate credits
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, processedPayments: { $ne: paymentId } },
    { 
      $inc: { purchasedCredits: credits },
      $push: { processedPayments: paymentId }
    },
    { new: true }
  );

  if (!updatedUser) {
    // Check if the user exists but the payment was already processed
    const userExists = await User.findById(userId);
    if (userExists) {
      logger.info(`Payment ${paymentId} already processed for user ${userId}`);
      
      // RECOVERY FOR P3 LEDGER DESYNCHRONIZATION:
      // If the user already has this payment in processedPayments, but the transaction log
      // is missing (e.g. process crashed between credit update and transaction creation),
      // we gracefully recover the ledger state.
      try {
        const existingTxn = await CreditTransaction.findOne({ razorpayPaymentId: paymentId });
        if (!existingTxn) {
          logger.info(`Recovering missing ledger entry for payment ${paymentId}`);
          await CreditTransaction.create({
            userId: userExists._id,
            type: 'purchase',
            amount: credits,
            description: `Purchased ${planName}`,
            razorpayPaymentId: paymentId,
            razorpayOrderId: orderId
          });
        }
      } catch (recoveryErr: any) {
        if (recoveryErr.code !== 11000) {
          logger.error('Error recovering credit transaction log:', recoveryErr);
        }
      }

      return { success: true, user: userExists, alreadyProcessed: true };
    }
    
    logger.error(`User ${userId} not found during payment processing`);
    return { success: false };
  }

  // Record the transaction for history ONLY AFTER successfully crediting the user
  try {
    await CreditTransaction.create({
      userId: updatedUser._id,
      type: 'purchase',
      amount: credits,
      description: `Purchased ${planName}`,
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId
    });
  } catch (txnError: any) {
    if (txnError.code === 11000) {
      // SUCCESSFUL CONCURRENT RECOVERY:
      // W1 credited the user but yielded before creating the transaction.
      // W2 failed the user update, entered the recovery block, and created the transaction.
      // W1 then resumed and hit this duplicate key error.
      // Since W1 was the process that successfully credited the user, it is safe to ignore
      // this duplicate key error. The ledger is correctly populated, and the user has their credits.
      logger.info(`Ledger entry for payment ${paymentId} was safely created by a concurrent request. Proceeding.`);
    } else {
      // Standard failure, wait for Razorpay retry to trigger P3 recovery
      logger.error('Error creating credit transaction log:', txnError);
    }
  }

  return { success: true, user: updatedUser, alreadyProcessed: false };
};
