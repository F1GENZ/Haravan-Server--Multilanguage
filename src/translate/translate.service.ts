import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class TranslateService {
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

  async translateText(
    text: string,
    targetLanguage: string,
    apiKey: string,
    customPrompt?: string
  ): Promise<string> {
    if (!text || text.trim() === '') {
      return '';
    }

    try {
      const openai = new OpenAI({
        apiKey: apiKey,
        timeout: 60000,
        maxRetries: 2
      });

      const targetLanguageName = this.LANGUAGE_NAMES[targetLanguage] || targetLanguage;
      
      const mainPrompt = `Translate the following text to ${targetLanguageName}. Keep the same tone and style. Only return the translated text without any explanation.`;
      
      const fullPrompt = customPrompt && customPrompt.trim() 
        ? `${mainPrompt}\n\nAdditional requirements: ${customPrompt}` 
        : mainPrompt;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: fullPrompt
          },
          {
            role: "user",
            content: text
          }
        ],
        max_completion_tokens: 2000
      });

      const result = completion.choices[0]?.message?.content?.trim() || '';
      
      return result;
    } catch (error) {
      this.handleOpenAIError(error);
    }
  }

  async translateHTML(
    html: string,
    targetLanguage: string,
    apiKey: string,
    customPrompt?: string
  ): Promise<string> {
    if (!html || html.trim() === '') {
      return '';
    }

    try {
      const openai = new OpenAI({
        apiKey: apiKey,
        timeout: 60000,
        maxRetries: 2
      });

      const targetLanguageName = this.LANGUAGE_NAMES[targetLanguage] || targetLanguage;
      
      const mainPrompt = `Translate the following HTML content to ${targetLanguageName}. Translate only the text inside HTML tags, keep all HTML tags and attributes unchanged. Return only the translated HTML without any explanation or prefix.`;
      
      const fullPrompt = customPrompt && customPrompt.trim() 
        ? `${mainPrompt} ${customPrompt}` 
        : mainPrompt;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `${fullPrompt}\n\n${html}`
          }
        ],
        temperature: 0.3,
        max_completion_tokens: 4000
      });

      let result = completion.choices[0]?.message?.content?.trim() || '';
      
      // Remove "HTML:" prefix if GPT added it
      if (result.startsWith('HTML:')) {
        result = result.substring(5).trim();
      }
      
      return result;
    } catch (error) {
      this.handleOpenAIError(error);
    }
  }

  private handleOpenAIError(error: any): never {
    if (error.status === 401) {
      throw new HttpException(
        'OpenAI API Key không hợp lệ hoặc đã hết hạn',
        HttpStatus.UNAUTHORIZED
      );
    } else if (error.status === 429) {
      throw new HttpException(
        'Quá nhiều yêu cầu tới OpenAI API. Vui lòng đợi và thử lại',
        HttpStatus.TOO_MANY_REQUESTS
      );
    } else if (error.status === 402 || (error.message && error.message.includes('quota'))) {
      throw new HttpException(
        'Tài khoản OpenAI đã hết quota. Vui lòng kiểm tra billing',
        HttpStatus.PAYMENT_REQUIRED
      );
    }
    
    throw new HttpException(
      `Lỗi khi gọi OpenAI API: ${error.message || 'Unknown error'}`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
