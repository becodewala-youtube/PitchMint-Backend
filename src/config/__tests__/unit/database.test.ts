import mongoose from 'mongoose';
import connectDB from '../../database';
import env from '../../env';

describe('Database Config Unit Tests', () => {
  let originalExit: (code?: number) => never;
  let mockExit: jest.Mock;
  let mockConsoleLog: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    originalExit = process.exit;
    mockExit = jest.fn();
    (process as any).exit = mockExit;
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (process as any).exit = originalExit;
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  test('connectDB connects successfully when MONGODB_URI is present', async () => {
    jest.spyOn(mongoose, 'connect').mockResolvedValueOnce({
      connection: { host: 'cluster0.mock.mongodb.net' }
    } as any);

    await connectDB();

    expect(mongoose.connect).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringContaining('MongoDB Connected: cluster0.mock.mongodb.net')
    );
    expect(mockExit).not.toHaveBeenCalled();
  });

  test('connectDB exits with 1 when MONGODB_URI is empty', async () => {
    const originalUri = env.MONGODB_URI;
    (env as any).MONGODB_URI = '';

    try {
      await connectDB();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('MONGODB_URI is not configured')
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    } finally {
      (env as any).MONGODB_URI = originalUri;
    }
  });

  test('connectDB exits with 1 when mongoose.connect throws error', async () => {
    jest.spyOn(mongoose, 'connect').mockRejectedValueOnce(new Error('Connection timeout'));

    await connectDB();

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Connection timeout')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
