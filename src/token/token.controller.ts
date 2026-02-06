import { Controller, Get, Query } from '@nestjs/common';
import { TokenService } from './token.service';

@Controller('token')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Get('trial') 
  async getTrialInfo(@Query('orgid') orgid: string) {
    if (!orgid) {
      return {
        success: false,
        message: 'orgid is required!!'
      }; 
    }

    const trialInfo = await this.tokenService.getTrialInfo(orgid);
    
    return {
      success: true,
      data: trialInfo
    };
  }
}
