import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HaravanService } from './haravan.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HaravanCronService {
  private readonly logger = new Logger(HaravanCronService.name);
  constructor(
    private readonly haravanService: HaravanService,
    private readonly redisService: RedisService
  ) { }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron() {
    try {
      this.logger.log('Cron job started');
      const apps = await this.redisService.getKeys('haravan:multilanguage:app_install:*');
      if (apps.length === 0) return;

      await Promise.all(apps.map(async (app) => {
        const appData = await this.redisService.get(app);
        if (!appData) return;

        const { status, expired_at, refresh_token, orgid } = appData;
        if (status == 'unactive') return;
        if (Date.now() > expired_at) return;
        const access_token = await this.haravanService.refreshToken(orgid, refresh_token);
        if (!access_token) {
          this.logger.warn(`Failed to refresh token for orgid ${orgid}`);
          return;
        }
        this.logger.log(`Success refreshed token for orgId: ${orgid}`);
      }));
    } catch (error) {
      this.logger.error('Error occurred while processing cron job:', error);
    } finally {
      this.logger.log('Cron job finished');
    }
  }
}