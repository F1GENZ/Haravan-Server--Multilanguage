import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { HaravanService } from 'src/haravan/haravan.service';
import { RedisService } from 'src/redis/redis.service';
import { Response } from 'express';

@Injectable() 
export class ShopAuthGuard implements CanActivate {
  constructor(private readonly redis: RedisService, private readonly haravanService: HaravanService) { }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res: Response = context.switchToHttp().getResponse();
    const orgid = req.headers.orgid || req.query.orgid || req.body?.orgid;
    if (!orgid) throw new BadRequestException('Missing orgid');
    try {
      const { access_token } = await this.redis.get(`haravan:multilanguage:app_install:${orgid}`);
      req.token = access_token;
    } catch (error) {
      throw new UnauthorizedException('Session expired, please login again');
    }
    return true;
  }
}
