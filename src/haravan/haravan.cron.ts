import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HaravanService } from './haravan.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HaravanCronService {
  private readonly logger = new Logger(HaravanCronService.name);
  private isRunning = false; // Prevent concurrent runs
  
  constructor(
    private readonly haravanService: HaravanService,
    private readonly redisService: RedisService
  ) { }

  // Helper: delay between API calls to respect rate limits
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    // Prevent concurrent runs
    if (this.isRunning) {
      this.logger.warn('Cron job already running, skipping...');
      return;
    }

    this.isRunning = true;
    let successCount = 0;
    let failCount = 0;

    try {
      this.logger.log('🔄 Token refresh cron started');
      const apps = await this.redisService.getKeys('haravan:multilanguage:app_install:*');
      
      if (apps.length === 0) {
        this.logger.log('No apps to refresh');
        return;
      }

      this.logger.log(`Found ${apps.length} apps to process`);

      // Process sequentially with delay to respect rate limits
      for (const app of apps) {
        try {
          const appData = await this.redisService.get(app);
          if (!appData) continue;

          const { status, expires_at, refresh_token, orgid } = appData;
          
          // Skip inactive apps
          if (status === 'unactive' || status === 'cancelled') {
            this.logger.debug(`Skipping inactive app: ${orgid}`);
            continue;
          }

          // Skip if subscription expired
          if (expires_at && Date.now() > expires_at) {
            this.logger.debug(`Skipping expired app: ${orgid}`);
            continue;
          }

          // Refresh token
          const access_token = await this.haravanService.refreshToken(orgid, refresh_token);
          
          if (access_token) {
            successCount++;
            this.logger.log(`✅ Refreshed token for orgid: ${orgid}`);
          } else {
            failCount++;
            this.logger.warn(`❌ Failed to refresh token for orgid: ${orgid}`);
          }

          // Rate limiting: wait 500ms between API calls
          await this.delay(500);
          
        } catch (error) {
          failCount++;
          this.logger.error(`Error processing app ${app}:`, error.message);
        }
      }

    } catch (error) {
      this.logger.error('Critical error in cron job:', error);
    } finally {
      this.isRunning = false;
      this.logger.log(`🏁 Cron finished. Success: ${successCount}, Failed: ${failCount}`);
    }
  }
}
