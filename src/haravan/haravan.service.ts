import { BadRequestException, UnauthorizedException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { RedisService } from '../redis/redis.service';
import { HaravanAPIService } from './haravan.api';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class HaravanService {
  constructor(
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
    private readonly haravanAPIService: HaravanAPIService
  ) { }

  private getHaravanConfig() {
    return {
      frontEndUrl: this.config.get("FRONTEND_URL"),
      urlAuthorize: this.config.get("HRV_URL_AUTHORIZE"),
      urlConnectToken: this.config.get('HRV_URL_CONNECT_TOKEN'),
      clientId: this.config.get('HRV_CLIENT_ID'),
      clientSecret: this.config.get('HRV_CLIENT_SECRET'),
      loginCallbackUrl: this.config.get('HRV_LOGIN_CALLBACK_URL'),
      installCallbackUrl: this.config.get('HRV_INSTALL_CALLBACK_URL'),
      scopeLogin: this.config.get('HRV_SCOPE_LOGIN'),
      scopeInstall: this.config.get('HRV_SCOPE_INSTALL'),
      grant_type_install: this.config.get('HRV_GRANT_TYPE_INSTALL'),
      grant_type_refresh: this.config.get('HRV_GRANT_TYPE_REFRESH'),
      responseType: this.config.get("HRV_RESPONSE_TYPE"),
      responseMode: this.config.get('HRV_RESPONSE_MODE'),
      nonce: this.config.get('HRV_NONCE'),
      webhookSecret: this.config.get('HRV_WEBHOOK_SECRET'),
      urlWebhooks: this.config.get('HRV_WEBHOOK_URL'),
      urlScriptTags: this.config.get('HRV_URL_SCRIPT_TAGS'),
    };
  }

  private async buildUrlInstall() {
    const hrvConfig = this.getHaravanConfig();
    const url =
      `${hrvConfig.urlAuthorize}` +
      `?response_type=${hrvConfig.responseType}` +
      `&scope=${hrvConfig.scopeInstall}` +
      `&client_id=${hrvConfig.clientId}` +
      `&redirect_uri=${hrvConfig.installCallbackUrl}` +
      `&nonce=${hrvConfig.nonce}`;
    return url;
  }  

  async loginApp(orgid: string): Promise<string> {
    try {
      if (orgid === undefined || orgid === null || orgid.trim() === '' || orgid === "null") {
        return await this.buildUrlInstall();
      } else {
        const checkOrgidExists = await this.redisService.has(`haravan:multilanguage:app_subscriptions:${orgid}`);
        if (!checkOrgidExists) {
          return await this.buildUrlInstall();
        }
      }
      return this.getHaravanConfig().frontEndUrl;
    } catch (error) {
      return `Error logging in for organization ${orgid}: ${error.message}`;
    }
  }
  async installApp(code: string, res): Promise<string> {
    if (!code) throw new BadRequestException("Missing Code");

    const hrvConfig = this.getHaravanConfig();
    const params = new URLSearchParams({
      code,
      client_id: hrvConfig.clientId,
      client_secret: hrvConfig.clientSecret,
      grant_type: hrvConfig.grant_type_install,
      redirect_uri: hrvConfig.installCallbackUrl
    }); 
    try {
      const response = await axios.post(hrvConfig.urlConnectToken, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      if (!response.data) throw new BadRequestException();
      const { id_token, access_token, expires_in, refresh_token } = response.data;
      const decodedIDToken = await jwt.decode(id_token) as Record<string, any>;
      const { orgid, orgsub } = decodedIDToken;

      // Check if app subscription already exists
      const existingApp = await this.redisService.get(`haravan:multilanguage:app_install:${orgid}`);
      // if (!existingApp) await this.haravanAPIService.subscribeWebhook(access_token);

      const tokenData = {
        access_token,
        refresh_token, 
        orgid,
        orgsub,
        status: existingApp ? existingApp.status : 'trial',
        expires_at: existingApp ? existingApp.expires_at : Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      }; 
      await this.redisService.set(`haravan:multilanguage:app_install:${orgid}`, tokenData, 30 * 24 * 60 * 60); // 30 days
      res.redirect(`${hrvConfig.frontEndUrl}?orgid=${orgid}`);
    } catch (error) {
      console.log(error);
    }
    return `Installation status for code ${code}`;
  }

  async refreshToken(orgid, old_refresh_token) {
    if (!old_refresh_token) throw new UnauthorizedException("No Refresh Token");
    const hrvConfig = this.getHaravanConfig();
    const params = new URLSearchParams({
      refresh_token: old_refresh_token,
      client_id: hrvConfig.clientId,
      client_secret: hrvConfig.clientSecret,
      grant_type: hrvConfig.grant_type_refresh
    });

    try {
      const response = await axios.post(hrvConfig.urlConnectToken, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      if (!response.data) throw new BadRequestException();
      const { access_token, expires_in, refresh_token } = response.data;
      const tokenData = {
        access_token,
        refresh_token,
        expires_at: Date.now() + expires_in,
      };
      const existsApp = await this.redisService.get(`haravan:multilanguage:app_install:${orgid}`);
      if (!existsApp) {
        await this.redisService.set(`haravan:multilanguage:app_install:${orgid}`, tokenData, 30 * 24 * 60 * 60); // 30 days
      } else {
        existsApp.access_token = access_token;
        existsApp.refresh_token = refresh_token;
        await this.redisService.set(`haravan:multilanguage:app_install:${orgid}`, existsApp, 30 * 24 * 60 * 60); // 30 days
      }
      return access_token;
    } catch (error) {
      console.log(error);
    }
  }

  async getWebhook(query: any): Promise<any> {
    const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': verifyToken } = query;
    const hrvConfig = this.getHaravanConfig();
    if (mode && verifyToken) {
      if (verifyToken !== hrvConfig.webhookSecret) {
        throw new UnauthorizedException("Invalid webhook secret");
      }
      return challenge;
    }
  }

  async handleWebhook(headers: any, body: any): Promise<any> {
    try {
      const hrvTopic = headers['x-haravan-topic'];
      const orgid = headers['x-haravan-org-id'];
      switch (hrvTopic) {
        case 'app_subscriptions/update':
          const { status, expired_at } = body;
          const ttlSeconds = Math.floor((+new Date(expired_at) - Date.now()) / 1000);
          const existsApp = await this.redisService.get(`haravan:multilanguage:app_install:${orgid}`);
          if (existsApp) {
            existsApp.status = status; 
            existsApp.expires_at = +new Date(expired_at);
            await this.redisService.set(`haravan:multilanguage:app_install:${orgid}`, existsApp, 30 * 24 * 60 * 60); // 30 days
          }
          if (status === 'active') {
            console.log(`Updating subscription for orgid: ${orgid}`);
            await this.redisService.set(`haravan:multilanguage:app_subscriptions:${orgid}`, body, ttlSeconds);
          } else {
            console.log(`Deleting subscription for orgid: ${orgid}`);
            await this.redisService.del(`haravan:multilanguage:app_subscriptions:${orgid}`);
          }
          break;
        default:
          console.warn(`Unhandled webhook topic: ${hrvTopic}`);
          break;
      }
    } catch (error) {
      console.error(error);
    }
  }
}
