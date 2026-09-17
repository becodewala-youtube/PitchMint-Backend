import Razorpay from 'razorpay';
import env from '../../../config/env';
import logger from '../../../config/logger';

let razorpay: Razorpay | null = null;

try {
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET
    });
    logger.info('✅ Razorpay initialized successfully');
  } else {
    logger.warn('⚠️ Razorpay credentials not fully configured');
    razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID || '',
      key_secret: env.RAZORPAY_KEY_SECRET || ''
    });
  }
} catch (error: any) {
  logger.error('❌ Failed to initialize Razorpay:', error.message);
  razorpay = new Razorpay({
    key_id: '',
    key_secret: ''
  });
}

export { razorpay };
export default razorpay;
