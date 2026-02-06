import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { HaravanService } from 'src/haravan/haravan.service';
import { RedisService } from 'src/redis/redis.service';
import { Response } from 'express';

@Injectable() 
export class ShopAuthGuard implements CanActivate {
  private readonly logger = new Logger(ShopAuthGuard.name);
  
  constructor(private readonly redis: RedisService, private readonly haravanService: HaravanService) { }
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res: Response = context.switchToHttp().getResponse();
    const orgid = req.headers.orgid || req.query.orgid || req.body?.orgid;
    
    if (!orgid) throw new BadRequestException('Missing orgid');
    
    try {
      const tokenData = await this.redis.get(`haravan:multilanguage:app_install:${orgid}`);
      
      if (!tokenData || !tokenData.access_token) {
        throw new UnauthorizedException('Session expired, please login again');
      }

      // Check if token needs refresh:
      // 1. No expires_at tracked (old token format)
      // 2. Token expires in less than 30 minutes
      const THIRTY_MINUTES = 30 * 60 * 1000;
      const now = Date.now();
      const needsRefresh = !tokenData.token_expires_at || 
                          (tokenData.token_expires_at && (tokenData.token_expires_at - now < THIRTY_MINUTES));
      
      if (needsRefresh && tokenData.refresh_token) {
        this.logger.log(`🔄 Token needs refresh for orgid: ${orgid}`);
        try {
          const newToken = await this.haravanService.refreshToken(orgid, tokenData.refresh_token);
          if (newToken) {
            req.token = newToken;
            req.orgid = orgid;
            this.logger.log(`✅ Token refreshed successfully for orgid: ${orgid}`);
            return true;
          }
        } catch (refreshError) {
          this.logger.warn(`⚠️ Failed to refresh token for orgid: ${orgid}: ${refreshError.message}`);
          // If refresh fails, try with existing token (might still work)
        }
      }
      
      req.token = tokenData.access_token;
      req.orgid = orgid;
      
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Session expired, please login again');
    }
    return true;
  }
}
