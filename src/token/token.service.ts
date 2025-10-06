import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class TokenService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Get trial period information for a shop
   * Returns the number of days remaining in the trial period
   */
  async getTrialInfo(shopDomain: string): Promise<{ daysRemaining: number; expiresAt: Date | null }> {
    try {
      const trialKey = `trial:${shopDomain}`;
      const expiresAt = await this.redisService.get<string>(trialKey);
      
      if (!expiresAt) {
        // No trial info found, return default 15 days for new shops
        const defaultExpiry = new Date();
        defaultExpiry.setDate(defaultExpiry.getDate() + 15);
        
        // Store in Redis
        await this.redisService.set(trialKey, defaultExpiry.toISOString());
        
        return {
          daysRemaining: 15,
          expiresAt: defaultExpiry
        };
      }
      
      const expiryDate = new Date(expiresAt);
      const now = new Date();
      const diffTime = expiryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return {
        daysRemaining: Math.max(0, diffDays), // Never return negative days
        expiresAt: expiryDate
      };
    } catch (error) {
      console.error('Error getting trial info:', error);
      // Return default on error
      return {
        daysRemaining: 15,
        expiresAt: null
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
