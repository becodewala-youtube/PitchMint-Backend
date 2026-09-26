import { processSuccessfulPayment } from '../credit.service';
import User from '../../users/user.model';
import CreditTransaction from '../credit.model';

jest.mock('../../users/user.model');
jest.mock('../credit.model');

describe('Credit Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processSuccessfulPayment', () => {
    test('should credit user and record ledger transaction on successful payment', async () => {
      const mockUpdatedUser = {
        _id: 'user-123',
        purchasedCredits: 25
      };

      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(mockUpdatedUser);
      (CreditTransaction.create as jest.Mock).mockResolvedValue({ _id: 'tx-1' });

      const result = await processSuccessfulPayment(
        'user-123',
        25,
        'Starter Pack',
        'pay_12345',
        'order_12345'
      );

      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'user-123', processedPayments: { $ne: 'pay_12345' } },
        {
          $inc: { purchasedCredits: 25 },
          $push: { processedPayments: 'pay_12345' }
        },
        { new: true }
      );
      expect(CreditTransaction.create).toHaveBeenCalledWith({
        userId: 'user-123',
        type: 'purchase',
        amount: 25,
        description: 'Purchased Starter Pack',
        razorpayPaymentId: 'pay_12345',
        razorpayOrderId: 'order_12345'
      });
      expect(result).toEqual({
        success: true,
        user: mockUpdatedUser,
        alreadyProcessed: false
      });
    });

    test('should return success and alreadyProcessed if payment was already recorded, and recover missing transaction', async () => {
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      const mockExistingUser = {
        _id: 'user-123',
        processedPayments: ['pay_already_there']
      };
      (User.findById as jest.Mock).mockResolvedValue(mockExistingUser);
      // Transaction missing in ledger (P3 recovery scenario)
      (CreditTransaction.findOne as jest.Mock).mockResolvedValue(null);
      (CreditTransaction.create as jest.Mock).mockResolvedValue({ _id: 'tx-recovered' });

      const result = await processSuccessfulPayment(
        'user-123',
        25,
        'Starter Pack',
        'pay_already_there',
        'order_already_there'
      );

      expect(CreditTransaction.findOne).toHaveBeenCalledWith({ razorpayPaymentId: 'pay_already_there' });
      expect(CreditTransaction.create).toHaveBeenCalledWith({
        userId: 'user-123',
        type: 'purchase',
        amount: 25,
        description: 'Purchased Starter Pack',
        razorpayPaymentId: 'pay_already_there',
        razorpayOrderId: 'order_already_there'
      });
      expect(result).toEqual({
        success: true,
        user: mockExistingUser,
        alreadyProcessed: true
      });
    });

    test('should handle duplicate key 11000 gracefully during P3 recovery', async () => {
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      const mockExistingUser = {
        _id: 'user-123',
        processedPayments: ['pay_duplicate']
      };
      (User.findById as jest.Mock).mockResolvedValue(mockExistingUser);
      (CreditTransaction.findOne as jest.Mock).mockResolvedValue(null);
      const err: any = new Error('E11000 duplicate key');
      err.code = 11000;
      (CreditTransaction.create as jest.Mock).mockRejectedValue(err);

      const result = await processSuccessfulPayment(
        'user-123',
        25,
        'Starter Pack',
        'pay_duplicate',
        'order_duplicate'
      );

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    test('should handle non-11000 error during P3 recovery without throwing', async () => {
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      const mockExistingUser = {
        _id: 'user-123',
        processedPayments: ['pay_duplicate']
      };
      (User.findById as jest.Mock).mockResolvedValue(mockExistingUser);
      (CreditTransaction.findOne as jest.Mock).mockResolvedValue(null);
      const err: any = new Error('Generic DB error');
      err.code = 500;
      (CreditTransaction.create as jest.Mock).mockRejectedValue(err);

      const result = await processSuccessfulPayment(
        'user-123',
        25,
        'Starter Pack',
        'pay_duplicate',
        'order_duplicate'
      );

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(true);
    });

    test('should return success: false if user is not found in database', async () => {
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (User.findById as jest.Mock).mockResolvedValue(null);

      const result = await processSuccessfulPayment(
        'missing-user',
        25,
        'Starter Pack',
        'pay_123',
        'order_123'
      );

      expect(result).toEqual({ success: false });
    });

    test('should safely handle 11000 concurrent collision during initial transaction creation', async () => {
      const mockUpdatedUser = { _id: 'user-123' };
      (User.findOneAndUpdate as jest.Mock).mockResolvedValue(mockUpdatedUser);
      const err: any = new Error('E11000 duplicate key');
      err.code = 11000;
      (CreditTransaction.create as jest.Mock).mockRejectedValue(err);

      const result = await processSuccessfulPayment(
        'user-123',
        25,
        'Starter Pack',
        'pay_collision',
        'order_collision'
      );

      expect(result.success).toBe(true);
      expect(result.alreadyProcessed).toBe(false);
    });
  });
});
