import { Controller, Get, Query } from '@nestjs/common';
import { TokenService } from './token.service';

@Controller('token')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Get('trial')
  async getTrialInfo(@Query('shop') shop: string) {
    if (!shop) {
      return {
        success: false,
        message: 'Shop domain is required'
      };
    }

    const trialInfo = await this.tokenService.getTrialInfo(shop);
    
    return {
      success: true,
      data: trialInfo
    };
  }
}
