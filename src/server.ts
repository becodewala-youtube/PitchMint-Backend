import mongoose from 'mongoose';
import app from './app/app';
import connectDB from './config/database';
import logger from './config/logger';
import env from './config/env';

const PORT = env.PORT || 5000;

if (env.NODE_ENV !== 'test') {
  connectDB()
    .then(() => {
      const server = app.listen(PORT, () => {
        logger.info(`🚀 Server running in ${env.NODE_ENV} mode on port ${PORT}`);
        
        // Log configuration status
        logger.info('Configuration check:', {
          RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID ? 'Set' : 'Missing',
          RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET ? 'Set' : 'Missing',
          RAZORPAY_WEBHOOK_SECRET: env.RAZORPAY_WEBHOOK_SECRET ? 'Set' : 'Missing'
        });
      });

      // Graceful shutdown handlers
      const shutdown = async (signal: string) => {
        logger.info(`${signal} received: closing HTTP server`);
        server.close(async () => {
          logger.info('HTTP server closed');
          try {
            await mongoose.connection.close();
            logger.info('MongoDB connection closed');
            process.exit(0);
          } catch (err) {
            logger.error('Error during MongoDB disconnection', err);
            process.exit(1);
          }
        });
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((error: any) => {
      logger.error('Failed to connect to MongoDB:', error.message);
      process.exit(1);
    });
}

export { app };
export default app;
