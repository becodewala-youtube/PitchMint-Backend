import { preflightCheck, up, down } from '../../v1-to-v2-credits';
import { Connection } from 'mongoose';

describe('V1 to V2 Credits Migration Unit Tests', () => {
  let mockCollection: any;
  let mockConnection: Partial<Connection>;

  beforeEach(() => {
    mockCollection = {
      find: jest.fn(),
      countDocuments: jest.fn(),
      updateOne: jest.fn()
    };
    mockConnection = {
      collection: jest.fn().mockReturnValue(mockCollection)
    };
  });

  describe('preflightCheck', () => {
    test('should detect anomalies for invalid credits or mixed v1/v2 fields', async () => {
      const mockDocs = [
        { _id: 'doc-1', email: 'doc1@example.com', credits: -5 },
        { _id: 'doc-2', email: 'doc2@example.com', credits: 'invalid' },
        { _id: 'doc-3', email: 'doc3@example.com', credits: 10, monthlyCredits: 3, purchasedCredits: 7 },
        { _id: 'doc-4', email: 'doc4@example.com', credits: 20 }
      ];

      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockDocs)
      });
      mockCollection.countDocuments.mockResolvedValue(5);

      const result = await preflightCheck(mockConnection as Connection);

      expect(result.unmigrated).toHaveLength(4);
      expect(result.alreadyMigratedCount).toBe(5);
      expect(result.anomalies.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('up migration', () => {
    test('should correctly migrate unmigrated users and preserve balance invariant', async () => {
      const mockDocs = [
        { _id: 'user-free', credits: 10, plan: 'free' },
        { _id: 'user-starter', credits: 50, plan: 'starter' },
        { _id: 'user-both', credits: 20, monthlyCredits: 3, purchasedCredits: 17 }
      ];

      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockDocs)
      });
      mockCollection.countDocuments.mockResolvedValue(2);
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const stats = await up(mockConnection as Connection, {
        dryRun: false,
        logger: () => {}
      });

      expect(stats.totalScanned).toBe(5);
      expect(stats.balanceInvariantPreserved).toBe(true);
      expect(stats.migratedSuccessfully).toBe(2);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'user-free', credits: 10 },
        expect.objectContaining({
          $set: expect.objectContaining({ monthlyCredits: 3, purchasedCredits: 7 }),
          $unset: { credits: '' }
        })
      );
    });

    test('dryRun should not perform database writes', async () => {
      const mockDocs = [
        { _id: 'user-free', credits: 10, plan: 'free' }
      ];

      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockDocs)
      });
      mockCollection.countDocuments.mockResolvedValue(0);

      const stats = await up(mockConnection as Connection, {
        dryRun: true,
        logger: () => {}
      });

      expect(mockCollection.updateOne).not.toHaveBeenCalled();
      expect(stats.migratedSuccessfully).toBe(1);
    });
  });

  describe('down migration', () => {
    test('should roll back migrated users combining credits into legacy field', async () => {
      const mockDocs = [
        { _id: 'user-1', monthlyCredits: 3, purchasedCredits: 10, migratedToV2At: new Date() },
        { _id: 'user-2', monthlyCredits: 25, purchasedCredits: 25, migratedToV2At: new Date() }
      ];

      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockDocs)
      });
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await down(mockConnection as Connection, {
        dryRun: false,
        logger: () => {}
      });

      expect(result.rolledBack).toBe(2);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'user-1' },
        {
          $set: { credits: 13 },
          $unset: { monthlyCredits: '', purchasedCredits: '', migratedToV2At: '' }
        }
      );
    });

    test('down dryRun should not execute updateOne', async () => {
      const mockDocs = [
        { _id: 'user-1', monthlyCredits: 3, purchasedCredits: 10, migratedToV2At: new Date() }
      ];

      mockCollection.find.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockDocs)
      });

      const result = await down(mockConnection as Connection, {
        dryRun: true,
        logger: () => {}
      });

      expect(result.rolledBack).toBe(1);
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });
  });
});
