import mongoose, { Model, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { IUser, IUserMethods, UserPlan } from './user.types';

type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    minlength: 6,
    select: false
  },
  profilePicture: {
    type: String,
    default: null
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  monthlyCredits: {
    type: Number,
    default: 3,
    min: [0, 'Monthly credits cannot be negative']
  },
  purchasedCredits: {
    type: Number,
    default: 0,
    min: [0, 'Purchased credits cannot be negative']
  },
  lastCreditReset: {
    type: Date,
    default: Date.now
  },
  plan: {
    type: String,
    enum: ['free', 'starter', 'pro', 'premium'],
    default: 'free'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  googleId: {
    type: String,
    default: null
  },
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  savedIdeas: [{
    type: Schema.Types.ObjectId,
    ref: 'Idea'
  }],
  processedPayments: {
    type: [String],
    default: []
  },
  processedRefunds: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Encrypt password using bcrypt
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword: string): Promise<boolean> {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function(): string {
  const token = crypto.randomInt(100000, 999999).toString();
  this.emailVerificationToken = token;
  this.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function(): string {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = token;
  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return token;
};

// Virtual to maintain backward compatibility in API responses
userSchema.virtual('credits').get(function() {
  return (this.monthlyCredits || 0) + (this.purchasedCredits || 0);
});

// Reset monthly credits (sync, in-memory)
userSchema.methods.resetMonthlyCredits = function(): boolean {
  const now = new Date();
  const lastReset = new Date(this.lastCreditReset);
  
  // Check if a month has passed in UTC
  if (now.getUTCMonth() !== lastReset.getUTCMonth() || now.getUTCFullYear() !== lastReset.getUTCFullYear()) {
    this.monthlyCredits = this.plan === 'free' ? 3 : this.getCreditsForPlan();
    this.lastCreditReset = now;
    return true;
  }
  return false;
};

// Atomically check and reset monthly credits using UTC boundaries
userSchema.methods.checkAndResetMonthlyCredits = async function(): Promise<boolean> {
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  if (this.lastCreditReset >= currentMonthStart) {
    return false;
  }

  const resetCredits = this.plan === 'free' ? 3 : this.getCreditsForPlan();
  const User = mongoose.model('User');

  const updated = await User.findOneAndUpdate(
    { _id: this._id },
    [
      {
        $set: {
          monthlyCredits: {
            $cond: [
              { $lt: ["$lastCreditReset", currentMonthStart] },
              resetCredits, 
              "$monthlyCredits"
            ]
          },
          lastCreditReset: {
            $cond: [
              { $lt: ["$lastCreditReset", currentMonthStart] },
              now,
              "$lastCreditReset"
            ]
          }
        }
      }
    ],
    { new: true }
  );

  if (updated && updated.lastCreditReset.getTime() === now.getTime()) {
    this.monthlyCredits = updated.monthlyCredits;
    this.purchasedCredits = updated.purchasedCredits;
    this.lastCreditReset = updated.lastCreditReset;
    return true;
  }

  if (updated) {
    this.monthlyCredits = updated.monthlyCredits;
    this.purchasedCredits = updated.purchasedCredits;
    this.lastCreditReset = updated.lastCreditReset;
  }
  
  return false;
};

// Get credits based on plan
userSchema.methods.getCreditsForPlan = function(): number {
  const creditMap: Record<UserPlan, number> = {
    free: 3,
    starter: 25,
    pro: 100,
    premium: 500
  };
  return creditMap[this.plan] || 3;
};

// Deduct credits (sync, in-memory)
userSchema.methods.deductCredits = function(amount: number = 1): boolean {
  if (this.credits >= amount) {
    if (this.monthlyCredits >= amount) {
      this.monthlyCredits -= amount;
    } else {
      const remainder = amount - this.monthlyCredits;
      this.monthlyCredits = 0;
      this.purchasedCredits -= remainder;
    }
    return true;
  }
  return false;
};

export const User = mongoose.model<IUser, UserModel>('User', userSchema);
export default User;
