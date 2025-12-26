import cron from 'node-cron';
import { SubscriptionService } from './subscription.service';
import logger from '../utils/logger';

const subscriptionService = new SubscriptionService();

/**
 * Cron job to check and update expired subscriptions
 * Runs daily at 2 AM
 */
export function startSubscriptionCronJobs() {
  // Check expired subscriptions daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('🔄 Running expired subscriptions check...');
      const count = await subscriptionService.checkAndUpdateExpiredSubscriptions();
      logger.info(`✅ Expired subscriptions check complete. ${count} subscriptions expired.`);
    } catch (error) {
      logger.error('❌ Error in expired subscriptions cron job:', error);
    }
  });

  // Check expiring subscriptions daily at 9 AM (for notifications)
  cron.schedule('0 9 * * *', async () => {
    try {
      logger.info('🔄 Checking for expiring subscriptions...');
      const expiring = await subscriptionService.getExpiringSubscriptions(7);
      
      if (expiring.length > 0) {
        logger.warn(`⚠️  ${expiring.length} subscriptions expiring within 7 days`);
        // TODO: Send notifications to tenants
        expiring.forEach((item: any) => {
          logger.warn(`Expiring soon: Tenant ${item.tenants.name} (${item.tenants.subdomain})`);
        });
      } else {
        logger.info('✅ No subscriptions expiring soon');
      }
    } catch (error) {
      logger.error('❌ Error in expiring subscriptions check:', error);
    }
  });

  logger.info('✅ Subscription cron jobs started');
  logger.info('   - Expired subscriptions check: Daily at 2:00 AM');
  logger.info('   - Expiring subscriptions check: Daily at 9:00 AM');
}

