import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../../user.model';

describe('User Model Unit Tests', () => {
  describe('Schema and Virtuals', () => {
    test('should calculate virtual credits correctly as monthly + purchased', () => {
      const user = new User({
        name: 'Alice',
        email: 'alice@example.com',
        monthlyCredits: 3,
        purchasedCredits: 25
      });

      expect(user.credits).toBe(28);
    });

    test('should default monthlyCredits to 3, purchasedCredits to 0, plan to free', () => {
      const user = new User({
        name: 'Bob',
        email: 'bob@example.com'
      });

      expect(user.monthlyCredits).toBe(3);
      expect(user.purchasedCredits).toBe(0);
      expect(user.credits).toBe(3);
      expect(user.plan).toBe('free');
      expect(user.isEmailVerified).toBe(false);
      expect(user.tokenVersion).toBe(0);
      expect(user.authProvider).toBe('local');
    });
  });

  describe('Password Hashing & Matching', () => {
    test('should return false from matchPassword if user has no password', async () => {
      const user = new User({
        name: 'Google User',
        email: 'google@example.com',
        authProvider: 'google'
      });

      const isMatch = await user.matchPassword('Password123!');
      expect(isMatch).toBe(false);
    });

    test('should correctly match password against bcrypt hash', async () => {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('Secret123!', salt);

      const user = new User({
        name: 'User With Pass',
        email: 'pass@example.com',
        password: hashedPassword
      });

      expect(await user.matchPassword('Secret123!')).toBe(true);
      expect(await user.matchPassword('WrongPass123!')).toBe(false);
    });
  });

  describe('Token Generation Methods', () => {
    test('generateEmailVerificationToken should produce 6-digit numeric string and 10-min expiry', () => {
      const user = new User({
        name: 'Verify User',
        email: 'verify@example.com'
      });

      const token = user.generateEmailVerificationToken();
      expect(token).toMatch(/^\d{6}$/);
      expect(user.emailVerificationToken).toBe(token);
      expect(user.emailVerificationExpires).toBeDefined();
      expect(new Date(user.emailVerificationExpires!).getTime()).toBeGreaterThan(Date.now());
    });

    test('generatePasswordResetToken should produce 64-char hex string and 10-min expiry', () => {
      const user = new User({
        name: 'Reset User',
        email: 'reset@example.com'
      });

      const token = user.generatePasswordResetToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(user.passwordResetToken).toBe(token);
      expect(user.passwordResetExpires).toBeDefined();
      expect(new Date(user.passwordResetExpires!).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('getCreditsForPlan', () => {
    test('should return correct quotas for all tier plans', () => {
      const user = new User({ name: 'Plan Tester', email: 'plan@example.com' });

      user.plan = 'free';
      expect(user.getCreditsForPlan()).toBe(3);

      user.plan = 'starter';
      expect(user.getCreditsForPlan()).toBe(25);

      user.plan = 'pro';
      expect(user.getCreditsForPlan()).toBe(100);

      user.plan = 'premium';
      expect(user.getCreditsForPlan()).toBe(500);

      user.plan = 'unknown' as any;
      expect(user.getCreditsForPlan()).toBe(3);
    });
  });

  describe('deductCredits (in-memory sync)', () => {
    test('should deduct from monthlyCredits first', () => {
      const user = new User({
        name: 'Deduct User',
        email: 'deduct@example.com',
        monthlyCredits: 3,
        purchasedCredits: 10
      });

      const success = user.deductCredits(2);
      expect(success).toBe(true);
      expect(user.monthlyCredits).toBe(1);
      expect(user.purchasedCredits).toBe(10);
      expect(user.credits).toBe(11);
    });

    test('should exhaust monthlyCredits and deduct remainder from purchasedCredits', () => {
      const user = new User({
        name: 'Split User',
        email: 'split@example.com',
        monthlyCredits: 2,
        purchasedCredits: 10
      });

      const success = user.deductCredits(5);
      expect(success).toBe(true);
      expect(user.monthlyCredits).toBe(0);
      expect(user.purchasedCredits).toBe(7);
      expect(user.credits).toBe(7);
    });

    test('should return false if total credits is insufficient', () => {
      const user = new User({
        name: 'Broke User',
        email: 'broke@example.com',
        monthlyCredits: 1,
        purchasedCredits: 1
      });

      const success = user.deductCredits(5);
      expect(success).toBe(false);
      expect(user.monthlyCredits).toBe(1);
      expect(user.purchasedCredits).toBe(1);
    });
  });

  describe('resetMonthlyCredits (sync)', () => {
    test('should reset monthly credits if lastCreditReset was in a previous month', () => {
      const pastDate = new Date();
      pastDate.setUTCMonth(pastDate.getUTCMonth() - 1);

      const user = new User({
        name: 'Monthly User',
        email: 'monthly@example.com',
        monthlyCredits: 0,
        purchasedCredits: 5,
        plan: 'starter',
        lastCreditReset: pastDate
      });

      const reset = user.resetMonthlyCredits();
      expect(reset).toBe(true);
      expect(user.monthlyCredits).toBe(25);
      expect(user.purchasedCredits).toBe(5);
    });

    test('should return false if already reset in current month', () => {
      const user = new User({
        name: 'Current User',
        email: 'current@example.com',
        monthlyCredits: 3,
        purchasedCredits: 0,
        plan: 'free',
        lastCreditReset: new Date()
      });

      const reset = user.resetMonthlyCredits();
      expect(reset).toBe(false);
      expect(user.monthlyCredits).toBe(3);
    });
  });

  describe('checkAndResetMonthlyCredits (atomic async)', () => {
    test('should return false immediately if lastCreditReset is within current month', async () => {
      const user = new User({
        name: 'Recent User',
        email: 'recent@example.com',
        lastCreditReset: new Date()
      });

      const result = await user.checkAndResetMonthlyCredits();
      expect(result).toBe(false);
    });

    test('should execute atomic findOneAndUpdate if lastCreditReset is before current month', async () => {
      const pastDate = new Date('2020-01-01T00:00:00Z');
      const user = new User({
        _id: new mongoose.Types.ObjectId(),
        name: 'Past User',
        email: 'past@example.com',
        plan: 'pro',
        monthlyCredits: 0,
        purchasedCredits: 10,
        lastCreditReset: pastDate
      });

      const now = new Date();
      const updatedMock = {
        monthlyCredits: 100,
        purchasedCredits: 10,
        lastCreditReset: now
      };

      const spy = jest.spyOn(mongoose.model('User'), 'findOneAndUpdate').mockResolvedValue(updatedMock as any);

      const result = await user.checkAndResetMonthlyCredits();
      expect(spy).toHaveBeenCalled();
      expect(user.monthlyCredits).toBe(100);
      expect(user.purchasedCredits).toBe(10);
      spy.mockRestore();
    });
  });
});
