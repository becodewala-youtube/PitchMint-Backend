const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');

// Check if user has enough credits
const checkCredits = (requiredCredits = 1) => {
  return async (req, res, next) => {
    try {
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

      // Store the updated user in req for next middleware
      req.user = user;
      next();
    } catch (error) {
      console.error('Credit check error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};

// Deduct credits after successful operation
const deductCredits = (amount = 1, service) => {
  return async (req, res, next) => {
    try {
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

        console.log(`Credits deducted: ${amount}, Remaining: ${user.credits}`);
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

module.exports = {
  checkCredits,
  deductCredits
};