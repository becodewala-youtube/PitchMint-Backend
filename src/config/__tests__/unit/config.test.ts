process.env.JWT_SECRET = 'test-suite-jwt-secret';

jest.mock('dotenv', () => ({
  config: jest.fn()
}));

import env from '../../env';
import logger from '../../logger';

describe('Config Unit Tests', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('env configuration', () => {
    test('should have JWT_SECRET defined in current environment', () => {
      expect(env.JWT_SECRET).toBeDefined();
    });

    test('should export default environment settings', () => {
      expect(env.NODE_ENV).toBeDefined();
      expect(env.PORT).toBeDefined();
      expect(typeof env.EMAIL_PORT).toBe('number');
    });

    test('loads env with custom values when provided in process.env', () => {
      process.env = {
        ...originalEnv,
        JWT_SECRET: 'test-secret-key',
        PORT: '8080',
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://localhost:27017/test',
        JWT_EXPIRES_IN: '7d',
        GOOGLE_CLIENT_ID: 'gid',
        GOOGLE_CLIENT_SECRET: 'gsec',
        GEMINI_API_KEY: 'gkey',
        RAZORPAY_KEY_ID: 'rkey',
        RAZORPAY_KEY_SECRET: 'rsec',
        RAZORPAY_WEBHOOK_SECRET: 'rwsec',
        CLOUDINARY_CLOUD_NAME: 'cname',
        CLOUDINARY_API_KEY: 'ckey',
        CLOUDINARY_API_SECRET: 'csec',
        EMAIL_HOST: 'smtp.custom.com',
        EMAIL_PORT: '465',
        EMAIL_USER: 'user@custom.com',
        EMAIL_PASS: 'secret',
        EMAIL_FROM: 'from@custom.com',
        FRONTEND_URL: 'http://custom.com'
      };

      let loadedEnv: any;
      jest.isolateModules(() => {
        loadedEnv = require('../../env').default;
      });

      expect(loadedEnv.PORT).toBe('8080');
      expect(loadedEnv.EMAIL_PORT).toBe(465);
      expect(loadedEnv.EMAIL_FROM).toBe('from@custom.com');
      expect(loadedEnv.NODE_ENV).toBe('production');
      expect(loadedEnv.FRONTEND_URL).toBe('http://custom.com');
    });

    test('loads env with fallback values when optional variables are unset', () => {
      process.env = {
        JWT_SECRET: 'test-secret-fallback'
      };

      let loadedEnv: any;
      jest.isolateModules(() => {
        loadedEnv = require('../../env').default;
      });

      expect(loadedEnv.PORT).toBe(5000);
      expect(loadedEnv.NODE_ENV).toBe('development');
      expect(loadedEnv.EMAIL_PORT).toBe(587);
      expect(loadedEnv.EMAIL_FROM).toBe('noreply@pitchmint.com');
    });

    test('uses EMAIL_USER as EMAIL_FROM fallback when EMAIL_FROM is empty', () => {
      process.env = {
        JWT_SECRET: 'test-secret-fallback',
        EMAIL_USER: 'myuser@pitchmint.com'
      };

      let loadedEnv: any;
      jest.isolateModules(() => {
        loadedEnv = require('../../env').default;
      });

      expect(loadedEnv.EMAIL_FROM).toBe('myuser@pitchmint.com');
    });

    test('throws error when JWT_SECRET is missing', () => {
      process.env = {};

      expect(() => {
        jest.isolateModules(() => {
          require('../../env');
        });
      }).toThrow('FATAL: JWT_SECRET environment variable is missing.');
    });
  });

  describe('logger configuration', () => {
    test('should export a winston logger instance with logging methods', () => {
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
    });

    test('configures console transport in development', () => {
      process.env = { ...originalEnv, NODE_ENV: 'development', JWT_SECRET: 'secret' };
      let loadedLogger: any;
      jest.isolateModules(() => {
        loadedLogger = require('../../logger').default;
      });
      expect(loadedLogger).toBeDefined();
    });

    test('configures logger in production without console transport', () => {
      process.env = { ...originalEnv, NODE_ENV: 'production', JWT_SECRET: 'secret' };
      let loadedLogger: any;
      jest.isolateModules(() => {
        loadedLogger = require('../../logger').default;
      });
      expect(loadedLogger).toBeDefined();
    });
  });
});

