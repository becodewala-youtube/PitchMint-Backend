const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
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
    type: mongoose.Schema.Types.ObjectId,
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
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  this.emailVerificationToken = token;
  this.emailVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  this.passwordResetToken = token;
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return token;
};

// Reset monthly credits
userSchema.methods.resetMonthlyCredits = function() {
  const now = new Date();
  const lastReset = new Date(this.lastCreditReset);
  
  // Check if a month has passed
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.credits = this.plan === 'free' ? 3 : this.getCreditsForPlan();
    this.lastCreditReset = now;
  }
};

// Get credits based on plan
userSchema.methods.getCreditsForPlan = function() {
  const creditMap = {
    free: 3,
    starter: 25,
    pro: 100,
    premium: 500
  };
  return creditMap[this.plan] || 3;
};

// Deduct credits
userSchema.methods.deductCredits = function(amount = 1) {
  if (this.credits >= amount) {
    this.credits -= amount;
    return true;
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);