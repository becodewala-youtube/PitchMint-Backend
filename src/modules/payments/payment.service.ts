import razorpay from '../../shared/integrations/razorpay/razorpay.client';
import env from '../../config/env';

export class PaymentService {
  async createPremiumOrder(userId: string, userEmail: string, userName: string) {
    if (!razorpay) throw new Error('Razorpay not initialized');

    const shortUserId = userId.slice(-8);
    const shortTimestamp = Date.now().toString().slice(-8);
    const receipt = `prem_${shortUserId}_${shortTimestamp}`.slice(0, 40);

    const orderData: any = {
      amount: 2900,
      currency: 'INR',
      receipt,
      notes: {
        userId,
        type: 'premium_upgrade',
        userEmail,
        userName
      },
      payment_capture: 1
    };

    const order: any = await razorpay.orders.create(orderData);
    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: env.RAZORPAY_KEY_ID,
      userEmail,
      userName
    };
  }
}

export const paymentService = new PaymentService();
export default paymentService;
