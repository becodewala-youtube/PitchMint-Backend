process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_12345';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pitchmint_test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_mock';
process.env.RAZORPAY_KEY_SECRET = 'rzp_mock_secret';
