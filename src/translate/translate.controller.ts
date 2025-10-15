import { Body, Controller, Post, HttpException, HttpStatus } from '@nestjs/common';
import { TranslateService } from './translate.service';

@Controller('/translate')
export class TranslateController {
  constructor(private readonly translateService: TranslateService) { }

  @Post('/text')
  async translateText(@Body() body: { text: string; targetLanguage: string; apiKey: string; customPrompt?: string }) {
    try {
      const { text, targetLanguage, apiKey, customPrompt } = body;

      if (!text || !targetLanguage || !apiKey) {
        throw new HttpException(
          'Missing required parameters',
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.translateService.translateText(
        text,
        targetLanguage,
        apiKey,
        customPrompt
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
  async translateHTML(
    @Body() body: { html: string; targetLanguage: string; apiKey: string; customPrompt?: string }
  ) {
    try {
      const { html, targetLanguage, apiKey, customPrompt } = body;

      if (!html || !targetLanguage || !apiKey) {
        throw new HttpException(
          'Missing required parameters',
          HttpStatus.BAD_REQUEST
        );
      }

      const result = await this.translateService.translateHTML(
        html,
        targetLanguage,
        apiKey,
        customPrompt
      );

      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        error.message || 'Translation failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
