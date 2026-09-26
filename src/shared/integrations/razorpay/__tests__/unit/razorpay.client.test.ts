describe('Razorpay Client Integration Unit Tests', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('initializes razorpay with credentials when present', () => {
    let client: any;
    jest.isolateModules(() => {
      jest.doMock('../../../../../config/env', () => ({
        __esModule: true,
        default: {
          RAZORPAY_KEY_ID: 'rzp_test_key123',
          RAZORPAY_KEY_SECRET: 'rzp_test_secret456'
        }
      }));
      client = require('../../razorpay.client').default;
    });

    expect(client).toBeDefined();
    expect(client.key_id).toBe('rzp_test_key123');
  });

  test('sets razorpay to null when credentials missing', () => {
    let client: any;
    jest.isolateModules(() => {
      jest.doMock('../../../../../config/env', () => ({
        __esModule: true,
        default: {
          RAZORPAY_KEY_ID: '',
          RAZORPAY_KEY_SECRET: ''
        }
      }));
      client = require('../../razorpay.client').default;
    });

    expect(client).toBeNull();
  });

  test('handles exception during Razorpay initialization and sets null', () => {
    let client: any;
    jest.isolateModules(() => {
      jest.doMock('../../../../../config/env', () => ({
        __esModule: true,
        default: {
          RAZORPAY_KEY_ID: 'rzp_test_key123',
          RAZORPAY_KEY_SECRET: 'rzp_test_secret456'
        }
      }));
      jest.doMock('razorpay', () => {
        return jest.fn().mockImplementation(() => {
          throw new Error('SDK init crash');
        });
      });
      client = require('../../razorpay.client').default;
    });

    expect(client).toBeNull();
  });
});
