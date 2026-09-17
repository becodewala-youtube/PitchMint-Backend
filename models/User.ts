import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserPlan = 'free' | 'starter' | 'pro' | 'premium';
export type AuthProvider = 'local' | 'google';
export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled' | 'past_due';

export interface IUserMethods {
  matchPassword(enteredPassword: string): Promise<boolean>;
  generateEmailVerificationToken(): string;
  generatePasswordResetToken(): string;
  resetMonthlyCredits(): void;
  getCreditsForPlan(): number;
  deductCredits(amount?: number): boolean;
}

export interface IUser extends Document, IUserMethods {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  profilePicture?: string | null;
  isPremium: boolean;
  credits: number;
  lastCreditReset: Date;
  plan: UserPlan;
  isEmailVerified: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | number | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | number | null;
  googleId?: string | null;
  authProvider: AuthProvider;
  savedIdeas: Types.ObjectId[];
  stripeCustomerId?: string | null;
  subscriptionId?: string | null;
  subscriptionStatus: SubscriptionStatus;
  createdAt: Date;
}

type UserModel = Model<IUser, {}, IUserMethods>;

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
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
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
  credits: {
    type: Number,
    default: 3
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
  stripeCustomerId: {
    type: String,
    default: null
  },
  subscriptionId: {
    type: String,
    default: null
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'inactive', 'cancelled', 'past_due'],
    default: 'inactive'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
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
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  this.emailVerificationToken = token;
  this.emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function(): string {
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  this.passwordResetToken = token;
  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return token;
};

// Reset monthly credits
userSchema.methods.resetMonthlyCredits = function(): void {
  const now = new Date();
  const lastReset = new Date(this.lastCreditReset);
  
  // Check if a month has passed
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.credits = this.plan === 'free' ? 3 : this.getCreditsForPlan();
    this.lastCreditReset = now;
  }
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

// Deduct credits
userSchema.methods.deductCredits = function(amount: number = 1): boolean {
  if (this.credits >= amount) {
    this.credits -= amount;
    return true;
  }
  return false;
};

export const User = mongoose.model<IUser, UserModel>('User', userSchema);
export default User;
