import { Body, Controller, Post, HttpException, HttpStatus, UseGuards, Headers, Get } from '@nestjs/common';
import { TranslateService } from './translate.service';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';

@Controller('/translate')
export class TranslateController {
  constructor(private readonly translateService: TranslateService) { }

  @Post('/text')
  @UseGuards(ShopAuthGuard)
  async translateText(
    @Headers('x-orgid') orgid: string,
    @Body() body: { text: string; targetLanguage: string }
  ) {
    try {
      const { text, targetLanguage } = body;

      if (!text || !targetLanguage) {
        throw new HttpException(
          'Missing required parameters',
          HttpStatus.BAD_REQUEST
        );
      }

      if (!orgid) {
        throw new HttpException(
          'Không tìm thấy thông tin cửa hàng',
          HttpStatus.UNAUTHORIZED
        );
      }

      const result = await this.translateService.translateText(
        text,
        targetLanguage,
        orgid
      );

      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        error.message || 'Translation failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('/html')
  @UseGuards(ShopAuthGuard)
  async translateHTML(
    @Headers('x-orgid') orgid: string,
    @Body() body: { html: string; targetLanguage: string }
  ) {
    try {
      const { html, targetLanguage } = body;

      if (!html || !targetLanguage) {
        throw new HttpException(
          'Missing required parameters',
          HttpStatus.BAD_REQUEST
        );
      }

      if (!orgid) {
        throw new HttpException(
          'Không tìm thấy thông tin cửa hàng',
          HttpStatus.UNAUTHORIZED
        );
      }

      const result = await this.translateService.translateHTML(
        html,
        targetLanguage,
        orgid
      );

      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        error.message || 'Translation failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Batch translate multiple fields in 1 API request (optimized for products)
  @Post('/fields')
  @UseGuards(ShopAuthGuard)
  async translateFields(
    @Headers('x-orgid') orgid: string,
    @Body() body: {
      fields: Array<{ key: string; value: string; type: 'text' | 'html' }>;
      targetLanguage: string;
    }
  ) {
    try {
      const { fields, targetLanguage } = body;

      if (!fields || fields.length === 0 || !targetLanguage) {
        throw new HttpException(
          'Missing required parameters',
          HttpStatus.BAD_REQUEST
        );
      }

      if (!orgid) {
        throw new HttpException(
          'Không tìm thấy thông tin cửa hàng',
          HttpStatus.UNAUTHORIZED
        );
      }

      const results = await this.translateService.translateMultipleFields(
        fields,
        targetLanguage,
        orgid
      );

      return { 
        success: true, 
        data: results,
        fieldsCount: fields.length,
        message: `Translated ${fields.length} fields in 1 API request`
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Translation failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('/bulk')
  @UseGuards(ShopAuthGuard)
  async translateBulk(
    @Headers('x-orgid') orgid: string,
    @Body() body: {
      items: Array<{ id: string; text: string; type: 'text' | 'html' }>;
      targetLanguage: string;
    }
  ) {
    try {
      const { items, targetLanguage } = body;

      if (!items || items.length === 0 || !targetLanguage) {
        throw new HttpException(
          'Missing required parameters',
          HttpStatus.BAD_REQUEST
        );
      }

      if (!orgid) {
        throw new HttpException(
          'Không tìm thấy thông tin cửa hàng',
          HttpStatus.UNAUTHORIZED
        );
      }

      // Check quota before processing
      const hasQuota = await this.translateService.checkQuota(orgid, items.length);
      if (!hasQuota) {
        const quota = await this.translateService.getQuota(orgid);
        throw new HttpException(
          `Không đủ quota. Còn lại: ${quota.remaining}/${quota.max} bản dịch`,
          HttpStatus.PAYMENT_REQUIRED
        );
      }

      // Process all items sequentially to avoid rate limiting
      const results = [];
      for (const item of items) {
        try {
          const translated = item.type === 'html'
            ? await this.translateService.translateHTML(item.text, targetLanguage, orgid)
            : await this.translateService.translateText(item.text, targetLanguage, orgid);

          results.push({
            id: item.id,
            success: true,
            data: translated,
          });
        } catch (error) {
          results.push({
            id: item.id,
            success: false,
            error: error.message || 'Translation failed',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      return {
        success: true,
        total: items.length,
        successCount,
        failedCount,
        results,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Bulk translation failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('/quota')
  @UseGuards(ShopAuthGuard)
  async getQuota(@Headers('x-orgid') orgid: string) {
    if (!orgid) {
      throw new HttpException(
        'Không tìm thấy thông tin cửa hàng',
        HttpStatus.UNAUTHORIZED
      );
    }

    const quota = await this.translateService.getQuota(orgid);
    return { success: true, data: quota };
  }
}
