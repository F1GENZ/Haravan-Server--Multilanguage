import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);
  private readonly geminiApiKey: string;
  private readonly maxQuotaPerShop: number;
  
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.geminiApiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.maxQuotaPerShop = parseInt(this.configService.get<string>('TRANSLATION_QUOTA_PER_SHOP') || '500', 10);
  }
  
  // Rate limiting for Gemini Free tier (15 RPM = 1 request per 4 seconds)
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 4000; // 4 seconds between requests

  private readonly LANGUAGE_NAMES = {
    'vi': 'Vietnamese',
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'zh-TW': 'Traditional Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'th': 'Thai',
    'id': 'Indonesian',
  };

  // Industry-specific prompts for optimized translations
  private readonly INDUSTRY_PROMPTS = {
    'fashion': 'Use trendy, stylish language suitable for fashion and clothing products. Keep brand names unchanged.',
    'electronics': 'Use technical but accessible language for electronics and gadgets. Keep product codes and specifications unchanged.',
    'beauty': 'Use luxurious, sophisticated language for beauty and cosmetic products. Emphasize product benefits.',
    'food': 'Use appetizing, descriptive language for food and beverage products. Keep ingredient names accurate.',
    'health': 'Use professional, trustworthy language for health and wellness products. Be accurate with medical terms.',
    'home': 'Use warm, inviting language for home and living products. Emphasize comfort and quality.',
    'sports': 'Use energetic, dynamic language for sports and fitness products. Emphasize performance.',
    'toys': 'Use fun, playful language for toys and games. Keep it family-friendly.',
    'jewelry': 'Use elegant, premium language for jewelry and accessories. Emphasize craftsmanship.',
    'automotive': 'Use professional, technical language for automotive products. Keep specifications accurate.',
    'general': 'Use clear, professional e-commerce language suitable for online shopping.',
  };

  // Get industry setting for a shop
  private getIndustryKey(orgid: string): string {
    return `haravan:multilanguage:industry:${orgid}`;
  }

  async getIndustry(orgid: string): Promise<string> {
    const key = this.getIndustryKey(orgid);
    return await this.redisService.get(key) || 'general';
  }

  async setIndustry(orgid: string, industry: string): Promise<void> {
    const key = this.getIndustryKey(orgid);
    await this.redisService.set(key, industry);
  }

  getIndustryPrompt(industry: string): string {
    return this.INDUSTRY_PROMPTS[industry] || this.INDUSTRY_PROMPTS['general'];
  }

  // ======== QUOTA MANAGEMENT ========
  private getQuotaKey(orgid: string): string {
    return `haravan:multilanguage:quota:${orgid}`;
  }

  async getQuota(orgid: string): Promise<{ used: number; remaining: number; max: number }> {
    const key = this.getQuotaKey(orgid);
    const used = parseInt(await this.redisService.get(key) || '0', 10);
    return {
      used,
      remaining: Math.max(0, this.maxQuotaPerShop - used),
      max: this.maxQuotaPerShop,
    };
  }

  async checkQuota(orgid: string, requestCount: number = 1): Promise<boolean> {
    const quota = await this.getQuota(orgid);
    return quota.remaining >= requestCount;
  }

  async useQuota(orgid: string, count: number = 1): Promise<void> {
    const key = this.getQuotaKey(orgid);
    const current = parseInt(await this.redisService.get(key) || '0', 10);
    // Set quota with no expiry (persists forever, or until reset)
    await this.redisService.set(key, current + count);
  }

  // ======== TOKEN USAGE LOGGING ========
  // Gemini pricing (as of 2024): 
  // - gemini-2.5-flash-lite: $0.075 per 1M input tokens, $0.30 per 1M output tokens
  // - gemini-2.0-flash: $0.10 per 1M input tokens, $0.40 per 1M output tokens
  private logTokenUsage(type: 'TEXT' | 'HTML' | 'BATCH', orgid: string, usageMetadata: any): void {
    if (!usageMetadata) {
      this.logger.warn(`⚠️ [${type}] No usage metadata returned for orgid: ${orgid}`);
      return;
    }

    const { promptTokenCount, candidatesTokenCount, totalTokenCount } = usageMetadata;
    
    // Calculate estimated cost (in USD)
    // Using gemini-2.5-flash-lite pricing for TEXT, gemini-2.0-flash for HTML/BATCH
    const inputPricePerMillion = type === 'TEXT' ? 0.075 : 0.10;
    const outputPricePerMillion = type === 'TEXT' ? 0.30 : 0.40;
    
    const inputCost = (promptTokenCount / 1_000_000) * inputPricePerMillion;
    const outputCost = (candidatesTokenCount / 1_000_000) * outputPricePerMillion;
    const totalCost = inputCost + outputCost;
    
    // Convert to VND (approximate rate: 1 USD = 25,000 VND)
    const totalCostVND = totalCost * 25000;

    this.logger.log(
      `💰 [${type}] orgid=${orgid} | ` +
      `Input: ${promptTokenCount} tokens | ` +
      `Output: ${candidatesTokenCount} tokens | ` +
      `Total: ${totalTokenCount} tokens | ` +
      `Cost: $${totalCost.toFixed(6)} (~${totalCostVND.toFixed(2)} VND)`
    );
  }

  // Rate limiter - ensure minimum delay between requests
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      this.logger.log(`Rate limiting: waiting ${waitTime}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  // Retry helper with exponential backoff
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 5, // Tăng số lần retry cho free tier
    baseDelay: number = 5000 // Tăng base delay lên 5s
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const statusCode = error.status || error.statusCode;
        const errorMessage = error.message || '';
        
        // Only retry on rate limit errors
        if (statusCode === 429 || errorMessage.includes('quota') || errorMessage.includes('rate')) {
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt); // 5s, 10s, 20s, 40s, 80s
            this.logger.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        // Don't retry on other errors
        throw error;
      }
    }
    
    throw lastError;
  }

  async translateText(
    text: string,
    targetLanguage: string,
    orgid: string
  ): Promise<string> {
    if (!text || text.trim() === '') {
      return '';
    }

    // Check quota
    const hasQuota = await this.checkQuota(orgid, 1);
    if (!hasQuota) {
      throw new HttpException(
        'Đã hết quota dịch thuật cho tháng này. Vui lòng nâng cấp gói hoặc liên hệ hỗ trợ.',
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    // Wait for rate limit before making request
    await this.waitForRateLimit();

    const ai = new GoogleGenAI({ apiKey: this.geminiApiKey });
    const targetLanguageName = this.LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    
    // Fixed prompt for e-commerce translations
    const systemInstruction = `Translate the following text to ${targetLanguageName}. Keep the same tone and style. Use clear, professional e-commerce language suitable for online shopping. Keep brand names, product codes and specifications unchanged. Only return the translated text without any explanation.`;

    try {
      const result = await this.retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash-lite',
          contents: text,
          config: {
            systemInstruction: systemInstruction,
            maxOutputTokens: 2000,
          },
        });
        
        // Log token usage and estimate cost
        this.logTokenUsage('TEXT', orgid, response.usageMetadata);
        
        return response.text?.trim() || '';
      });
      
      // Deduct quota after successful translation
      await this.useQuota(orgid, 1);
      
      return result;
    } catch (error) {
      this.handleGeminiError(error);
    }
  }

  // ======== BATCH MULTIPLE FIELDS IN 1 REQUEST ========
  // Reduces N API calls to 1 for multiple fields of same product
  async translateMultipleFields(
    fields: Array<{ key: string; value: string; type: 'text' | 'html' }>,
    targetLanguage: string,
    orgid: string
  ): Promise<Array<{ key: string; translated: string; success: boolean; error?: string }>> {
    if (!fields || fields.length === 0) {
      return [];
    }

    // Filter out empty fields
    const validFields = fields.filter(f => f.value && f.value.trim());
    if (validFields.length === 0) {
      return fields.map(f => ({ key: f.key, translated: '', success: true }));
    }

    // Check quota for all fields (count as 1 request for quota purposes)
    const hasQuota = await this.checkQuota(orgid, 1);
    if (!hasQuota) {
      throw new HttpException(
        'Đã hết quota dịch thuật. Vui lòng nâng cấp gói hoặc liên hệ hỗ trợ.',
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    await this.waitForRateLimit();

    const ai = new GoogleGenAI({ apiKey: this.geminiApiKey });
    const targetLanguageName = this.LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    // Build structured input for batch translation
    const inputData = validFields.map((f, idx) => 
      `[FIELD_${idx}:${f.key}]\n${f.value}\n[/FIELD_${idx}]`
    ).join('\n\n');

    const systemInstruction = `You are a professional e-commerce translator. Translate the following fields to ${targetLanguageName}.

RULES:
1. Each field is wrapped in [FIELD_N:key] and [/FIELD_N] tags
2. Translate the content BETWEEN the tags
3. Keep ALL HTML tags, attributes, URLs, CSS classes unchanged
4. Keep brand names, product codes, specifications unchanged
5. Use professional e-commerce language
6. Return in EXACT same format with translated content

OUTPUT FORMAT (must follow exactly):
[FIELD_0:key]
translated content here
[/FIELD_0]

[FIELD_1:key]
translated content here
[/FIELD_1]

...and so on for all fields.`;

    try {
      const response = await this.retryWithBackoff(async () => {
        return await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: inputData,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.2,
            maxOutputTokens: 8000,
          },
        });
      });

      // Log token usage
      this.logTokenUsage('BATCH', orgid, response.usageMetadata);
      
      const responseText = response.text?.trim() || '';
      
      // Parse response and extract translated fields
      const results: Array<{ key: string; translated: string; success: boolean; error?: string }> = [];
      
      for (let idx = 0; idx < validFields.length; idx++) {
        const field = validFields[idx];
        const startTag = `[FIELD_${idx}:${field.key}]`;
        const endTag = `[/FIELD_${idx}]`;
        
        const startIdx = responseText.indexOf(startTag);
        const endIdx = responseText.indexOf(endTag);
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          let translated = responseText.substring(startIdx + startTag.length, endIdx).trim();
          
          // Clean up any markdown code blocks
          if (translated.startsWith('```html')) {
            translated = translated.replace(/^```html\n?/, '').replace(/\n?```$/, '');
          } else if (translated.startsWith('```')) {
            translated = translated.replace(/^```\n?/, '').replace(/\n?```$/, '');
          }
          
          results.push({ key: field.key, translated, success: true });
        } else {
          results.push({ key: field.key, translated: field.value, success: false, error: 'Parse error' });
        }
      }

      // Deduct quota (1 request for all fields)
      await this.useQuota(orgid, 1);

      // Add empty fields back
      for (const field of fields) {
        if (!field.value || !field.value.trim()) {
          results.push({ key: field.key, translated: '', success: true });
        }
      }

      this.logger.log(`✅ [BATCH] Translated ${validFields.length} fields in 1 request for orgid=${orgid}`);
      
      return results;
    } catch (error) {
      this.logger.error(`❌ [BATCH] Translation failed for orgid=${orgid}: ${error.message}`);
      // Return original values on error
      return fields.map(f => ({ key: f.key, translated: f.value, success: false, error: error.message }));
    }
  }

  async translateHTML(
    html: string,
    targetLanguage: string,
    orgid: string
  ): Promise<string> {
    if (!html || html.trim() === '') {
      return '';
    }

    // Check quota
    const hasQuota = await this.checkQuota(orgid, 1);
    if (!hasQuota) {
      throw new HttpException(
        'Đã hết quota dịch thuật cho tháng này. Vui lòng nâng cấp gói hoặc liên hệ hỗ trợ.',
        HttpStatus.PAYMENT_REQUIRED
      );
    }

    const ai = new GoogleGenAI({ apiKey: this.geminiApiKey });
    const targetLanguageName = this.LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    
    // Optimized prompt for reliable HTML translation
    const systemInstruction = `You are an expert HTML translator. Your task:
1. Translate ONLY the visible text content to ${targetLanguageName}
2. PRESERVE all HTML tags exactly as they are: <div>, <span>, <p>, <a>, <strong>, <em>, <br>, <ul>, <li>, etc.
3. PRESERVE all HTML attributes exactly: class="...", id="...", href="...", style="...", src="...", etc.
4. NEVER translate: URLs, CSS class names, JavaScript code, email addresses, phone numbers
5. Keep brand names, product codes, and technical specifications unchanged
6. Use professional e-commerce language appropriate for online shopping
7. Return ONLY the translated HTML without any explanation, markdown, or code blocks`;


    try {
      let result = await this.retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: html,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.3,
            maxOutputTokens: 4000,
          },
        });
        
        // Log token usage and estimate cost
        this.logTokenUsage('HTML', orgid, response.usageMetadata);
        
        return response.text?.trim() || '';
      });
      
      // Remove "HTML:" prefix if Gemini added it
      if (result.startsWith('HTML:')) {
        result = result.substring(5).trim();
      }
      
      // Remove markdown code blocks if Gemini wrapped the response
      if (result.startsWith('```html')) {
        result = result.replace(/^```html\n?/, '').replace(/\n?```$/, '');
      } else if (result.startsWith('```')) {
        result = result.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      // Deduct quota after successful translation
      await this.useQuota(orgid, 1);
      
      return result;
    } catch (error) {
      this.handleGeminiError(error);
    }
  }

  private handleGeminiError(error: any): never {
    const errorMessage = error.message || '';
    const statusCode = error.status || error.statusCode;
    
    if (statusCode === 401 || errorMessage.includes('API key')) {
      throw new HttpException(
        'Gemini API Key không hợp lệ hoặc đã hết hạn',
        HttpStatus.UNAUTHORIZED
      );
    } else if (statusCode === 429 || errorMessage.includes('quota') || errorMessage.includes('rate')) {
      throw new HttpException(
        'Quá nhiều yêu cầu tới Gemini API. Vui lòng đợi và thử lại',
        HttpStatus.TOO_MANY_REQUESTS
      );
    } else if (statusCode === 403 || errorMessage.includes('permission')) {
      throw new HttpException(
        'Không có quyền truy cập Gemini API. Vui lòng kiểm tra API Key',
        HttpStatus.FORBIDDEN
      );
    }
    
    throw new HttpException(
      `Lỗi khi gọi Gemini API: ${errorMessage || 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
