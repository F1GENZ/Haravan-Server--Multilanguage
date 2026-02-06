import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class TokenService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Get trial period information for a shop
   * Returns the number of days remaining in the trial period
   */
  async getTrialInfo(orgid: string): Promise<{ daysRemaining: number; expiresAt: Date | null; status: string }> {
    try {
      // Get from app_install instead of separate trial key
      const appData = await this.redisService.get(`haravan:multilanguage:app_install:${orgid}`);
      
      if (!appData) {
        // No app install found
        return {
          daysRemaining: 0,
          expiresAt: null,
          status: 'not_installed'
        };
      }
      
      const { expires_at, status } = appData;
      
      if (!expires_at) {
        // No expiry set, return default 7 days
        return {
          daysRemaining: 7,
          expiresAt: null,
          status: status || 'trial'
        };
      }
      
      const expiryDate = new Date(expires_at);
      const now = new Date();
      const diffTime = expiryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return {
        daysRemaining: Math.max(0, diffDays), // Never return negative days
        expiresAt: expiryDate,
        status: status || 'trial'
      };
    } catch (error) {
      console.error('Error getting trial info:', error);
      // Return default on error
      return {
        daysRemaining: 0,
        expiresAt: null,
        status: 'error'
      };
    }
  }

  /**
   * Set trial period for a shop
   */
  async setTrialPeriod(shopDomain: string, days: number): Promise<void> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    
    const trialKey = `trial:${shopDomain}`;
    await this.redisService.set(trialKey, expiryDate.toISOString());
  }
}
