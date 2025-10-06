import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';

const allowedOrigins = [
  'capacitor://localhost', 
  'ionic://localhost',
  'http://localhost', 
  'http://localhost:5173',
  'https://haravan-client--faq.pages.dev',
  'https://haravan-client--faq.pages.dev/',
  'https://haravan.faq.f1genz.com',
  'https://haravan.faq.f1genz.com/'
];
 
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true); 
      } else {
        callback(new Error('Origin not allowed by CORS'));
      }
    },
  });
  app.use(cookieParser()); 
  app.setGlobalPrefix('api');
  const PORT = config.get('PORT') || 3333; 
  await app.listen(PORT, () => console.log('App listening on ' + PORT));
}
bootstrap();
 