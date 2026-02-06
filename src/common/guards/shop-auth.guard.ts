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

      // Check if token needs refresh (expires in less than 5 minutes)
      const FIVE_MINUTES = 5 * 60 * 1000;
      const needsRefresh = tokenData.expires_at && (tokenData.expires_at - Date.now() < FIVE_MINUTES);
      
      if (needsRefresh && tokenData.refresh_token) {
        this.logger.log(`Token expiring soon for orgid: ${orgid}, refreshing...`);
        try {
          const newToken = await this.haravanService.refreshToken(orgid, tokenData.refresh_token);
          if (newToken) {
            req.token = newToken;
            this.logger.log(`Token refreshed successfully for orgid: ${orgid}`);
          } else {
            req.token = tokenData.access_token;
          }
        } catch (refreshError) {
          this.logger.warn(`Failed to refresh token for orgid: ${orgid}, using existing token`);
          req.token = tokenData.access_token;
        }
      } else {
        req.token = tokenData.access_token;
      }
      
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Session expired, please login again');
    }
    return true;
  }
}

