import { Request, Response, NextFunction } from 'express';
import User from '../../modules/users/user.model';
import CreditTransaction from '../../modules/credits/credit.model';
import { RelatedService } from '../../modules/credits/credit.types';

// Check if user has enough credits
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

      // Reset monthly credits if needed
      user.resetMonthlyCredits();
      await user.save();

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
      req.user = await User.findById(req.user._id);
      next();
    } catch (error) {
      console.error('Credit check error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};

// Deduct credits after successful operation
export const deductCredits = (amount: number = 1, service: RelatedService) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      if (!req.user?._id) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const user = await User.findById(req.user._id);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Double check credits before deducting
      if (user.credits >= amount) {
        user.credits = Math.max(0, user.credits - amount);
        await user.save();

        // Record transaction
        await CreditTransaction.create({
          userId: user._id,
          type: 'usage',
          amount: -amount,
          description: `Used ${amount} credit(s) for ${service}`,
          relatedService: service
        });

        next();
      } else {
        return res.status(402).json({ 
          message: 'Insufficient credits',
          creditsRequired: amount,
          creditsAvailable: user.credits
        });
      }
    } catch (error) {
      console.error('Credit deduction error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};

export default {
  checkCredits,
  deductCredits
};
