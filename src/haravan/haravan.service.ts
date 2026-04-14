import { BadRequestException, UnauthorizedException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { RedisService } from '../redis/redis.service';
import { HaravanAPIService } from './haravan.api';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

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
      `&response_mode=query` + 
      `&nonce=${hrvConfig.nonce}`;
    return url;
  }

  private async buildUrlLogin() {
    const hrvConfig = this.getHaravanConfig();
    const url =
      `${hrvConfig.urlAuthorize}` +
      `?response_type=${hrvConfig.responseType}` +
      `&scope=${hrvConfig.scopeLogin}` +
      `&client_id=${hrvConfig.clientId}` +
      `&redirect_uri=${hrvConfig.loginCallbackUrl}` +
      `&response_mode=query` +
      `&nonce=${hrvConfig.nonce}`;
    return url;
  }

  async verifyHmac(rawQueryString: string): Promise<{ valid: boolean; orgid?: string; reason?: string }> {
    try {
      const params = new URLSearchParams(rawQueryString);
      const hmac = params.get('hmac');
      const orgid = params.get('orgid');
      const timestamp = params.get('timestamp');

      if (!hmac || !orgid) {
        return { valid: false, reason: 'Missing hmac or orgid' };
      }

      // 1. Rebuild message: ORIGINAL ORDER, exclude hmac (Haravan != Shopify)
      const parts: string[] = [];
      for (const [key, value] of params.entries()) {
        if (key === 'hmac') continue;
        parts.push(`${key}=${value}`);
      }
      const message = parts.join('&');

      // 2. Compute HMAC-SHA256
      const hrvConfig = this.getHaravanConfig();
      const computed = crypto
        .createHmac('sha256', hrvConfig.clientSecret)
        .update(message)
        .digest('hex');

      // 3. Timing-safe compare
      if (computed.length !== hmac.length) {
        return { valid: false, reason: 'HMAC mismatch' };
      }
      const isValid = crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hmac, 'hex'));
      if (!isValid) {
        return { valid: false, reason: 'HMAC mismatch' };
      }

      // 4. Timestamp check (< 5 min)
      if (timestamp) {
        const ts = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - ts) > 300) {
          return { valid: false, reason: 'Timestamp expired' };
        }
      }

      // 5. Redis check — app installed and active
      const appData = await this.redisService.get(`haravan:multilanguage:app_install:${orgid}`);
      if (!appData) {
        return { valid: false, reason: 'App not installed' };
      }
      if (appData.status === 'needs_reinstall' || appData.status === 'unactive') {
        return { valid: false, reason: `App status: ${appData.status}` };
      }

      // 6. Auto-refresh token if needed
      const THIRTY_MINUTES = 30 * 60 * 1000;
      const needsRefresh = !appData.token_expires_at || (appData.token_expires_at - Date.now() < THIRTY_MINUTES);
      if (needsRefresh && appData.refresh_token) {
        try {
          await this.refreshToken(orgid, appData.refresh_token);
          console.log(`✅ HMAC verify: token refreshed for orgid=${orgid}`);
        } catch (e) {
          console.warn(`⚠️ HMAC verify: token refresh failed for orgid=${orgid}`);
        }
      }

      console.log(`✅ HMAC verified for orgid=${orgid}`);
      return { valid: true, orgid };
    } catch (error) {
      console.error('❌ HMAC verify error:', error.message);
      return { valid: false, reason: error.message };
    }
  }

  async loginApp(orgid: string | string[]) {
    // Handle array case
    const rawOrgid = Array.isArray(orgid) ? orgid.find(o => o && o !== 'null' && o !== 'undefined' && o !== '') : orgid;
    
    // If no valid orgid, redirect to LOGIN (not install) to get id_token with orgid
    if (!rawOrgid || rawOrgid === 'null' || rawOrgid === 'undefined' || rawOrgid === '') {
      console.log('📝 No valid orgid provided, redirecting to LOGIN to identify shop');
      return await this.buildUrlLogin(); 
    }

    const cleanOrgid = rawOrgid.replace(/['\"]+/g, '');
    try {
      const appData = await this.redisService.get(`haravan:multilanguage:app_install:${cleanOrgid}`);
      
      console.log('🔍 Redis check for orgid:', cleanOrgid, '- exists:', !!appData, '- status:', appData?.status);
      
      // Condition 1: App not found → redirect to login to identify shop
      if (!appData) {
        console.log('📝 App not found, redirecting to LOGIN');
        return await this.buildUrlLogin();
      }
      
      // Condition 2: App marked for reinstall or unactive → redirect to install
      if (appData.status === 'needs_reinstall' || appData.status === 'unactive') {
        console.log(`📝 App status is ${appData.status}, redirecting to install`);
        return await this.buildUrlInstall();
      }
      
      // Condition 3: App installed & active → still require OAuth SSO proof
      // Don't trust orgid param alone — user must prove identity via OAuth
      console.log('📝 App found, requiring OAuth SSO verification');
      return await this.buildUrlLogin();
      
    } catch (error) {
      console.error('❌ Login error:', error.message);
      return `Error logging in for organization ${cleanOrgid}: ${error.message}`;
    }
  }
  async processLoginCallback(code: string, req: Request | any, res: Response | any) {
    if (!code) throw new BadRequestException("Missing Code");
    
    const hrvConfig = this.getHaravanConfig();
    const params = new URLSearchParams({
      code,
      client_id: hrvConfig.clientId,
      client_secret: hrvConfig.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: hrvConfig.loginCallbackUrl
    });

    try {
      console.log('🔄 Exchanging login code for info...');
      const response = await axios.post(hrvConfig.urlConnectToken, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      const { id_token } = response.data;
      if (!id_token) throw new Error("No id_token returned");
      
      console.log('🔑 Login: id_token received:', id_token ? `${id_token.substring(0, 50)}...` : 'MISSING');
      const decodedIDToken = jwt.decode(id_token) as Record<string, any>;
      console.log('🔍 Login: Decoded id_token:', JSON.stringify(decodedIDToken, null, 2));
      const { orgid } = decodedIDToken;
      console.log('👤 Login callback for orgid:', orgid);
      
      // Check if app is installed
      const exists = await this.redisService.has(`haravan:multilanguage:app_install:${orgid}`);
      
      if (exists) {
        console.log('✅ App installed, refreshing token...');
        // Refresh token logic
        const appData = await this.redisService.get(`haravan:multilanguage:app_install:${orgid}`);
        if (appData && appData.refresh_token) {
          try {
            console.log('🔄 Triggering value-added token refresh...');
            const newAccessToken = await this.refreshToken(orgid, appData.refresh_token);
            if (newAccessToken) {
               console.log('✨ Token refreshed successfully on login');
            }
          } catch (e) {
            console.warn('⚠️ Failed to auto-refresh token on login:', e.message);
          }
        }
        
        console.log('🚀 Redirecting to frontend URL');
        const frontendUrl = `${hrvConfig.frontEndUrl}?orgid=${orgid}`;
        // Check if request expects JSON (Axios sets Accept: application/json)
        const acceptHeader = req.headers.accept || '';
        if (acceptHeader.includes('application/json')) {
           console.log('📤 Returning JSON response');
           return res.json({ url: frontendUrl });
        }
        console.log('🔀 Performing redirect');
        res.redirect(frontendUrl);
      } else {
        console.log('⚠️ App NOT installed, returning INSTALL URL');
        const installUrl = await this.buildUrlInstall();
        const acceptHeader = req.headers.accept || '';
        if (acceptHeader.includes('application/json')) {
           return res.json({ url: installUrl });
        }
        res.redirect(installUrl);
      }
    } catch (error) {
      console.error('❌ Login callback error:', error.message);
      const acceptHeader = req.headers.accept || '';
      if (acceptHeader.includes('application/json')) {
         return res.status(400).json({ error: error.message });
      }
      res.redirect(`${hrvConfig.frontEndUrl}/error?message=${encodeURIComponent(error.message)}`);
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
      console.log('🔑 Install: id_token received:', id_token ? `${id_token.substring(0, 50)}...` : 'MISSING');
      const decodedIDToken = await jwt.decode(id_token) as Record<string, any>;
      console.log('🔍 Install: Decoded id_token:', JSON.stringify(decodedIDToken, null, 2));
      const { orgid, orgsub } = decodedIDToken;
      console.log('📋 Install: Extracted orgid:', orgid, 'orgsub:', orgsub);

      // Check if app subscription already exists
      const existingApp = await this.redisService.get(`haravan:multilanguage:app_install:${orgid}`);
      // if (!existingApp) await this.haravanAPIService.subscribeWebhook(access_token);

      // Initialize quota for new shops
      // Trial = 10, Paid plans get more from env config
      const trialQuota = 10;
      const paidQuota = parseInt(this.config.get('TRANSLATION_QUOTA_PER_SHOP') || '500', 10);
      
      // expires_in is in seconds, convert to milliseconds
      const tokenExpiresAt = Date.now() + (expires_in * 1000);
      
      // Determine quota: keep existing if reinstall, otherwise 10 for trial
      const isNewInstall = !existingApp;
      const quotaToUse = isNewInstall ? trialQuota : (existingApp.quota_remaining ?? existingApp.quota_total ?? paidQuota);
      const quotaTotal = isNewInstall ? trialQuota : (existingApp.quota_total ?? paidQuota);
      
      const tokenData = {
        access_token,
        refresh_token, 
        token_expires_at: tokenExpiresAt,
        orgid,
        orgsub,
        status: existingApp ? existingApp.status : 'trial',
        expires_at: existingApp ? existingApp.expires_at : Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days trial
        // Quota: keep existing or initialize new (trial = 10)
        quota_remaining: quotaToUse,
        quota_total: quotaTotal,
      }; 
      await this.redisService.set(`haravan:multilanguage:app_install:${orgid}`, tokenData, 30 * 24 * 60 * 60); // 30 days
      
      if (!existingApp) {
        console.log(`✅ [QUOTA] Initialized ${trialQuota} translations for orgid=${orgid}`);
      }
      
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
      
      // expires_in is in seconds, convert to milliseconds
      const tokenExpiresAt = Date.now() + (expires_in * 1000);
      
      const existsApp = await this.redisService.get(`haravan:multilanguage:app_install:${orgid}`);
      if (!existsApp) {
        const tokenData = {
          access_token,
          refresh_token,
          token_expires_at: tokenExpiresAt,
        };
        await this.redisService.set(`haravan:multilanguage:app_install:${orgid}`, tokenData, 30 * 24 * 60 * 60); // 30 days
      } else {
        existsApp.access_token = access_token;
        existsApp.refresh_token = refresh_token;
        existsApp.token_expires_at = tokenExpiresAt;
        await this.redisService.set(`haravan:multilanguage:app_install:${orgid}`, existsApp, 30 * 24 * 60 * 60); // 30 days
      }
      console.log(`✅ Token refreshed for orgid=${orgid}, expires in ${expires_in}s`);
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
