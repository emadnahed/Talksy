import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  // Configure Redis WebSocket adapter for horizontal scaling
  const redisIoAdapter = new RedisIoAdapter(app, configService);
  const redisConnected = await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  if (redisConnected) {
    logger.log('Horizontal scaling enabled via Redis WebSocket adapter');
  } else {
    logger.warn('Running in single-instance mode (Redis adapter not connected)');
  }

  // Global pipes, filters, and interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Standard response format for all HTTP responses
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Standard error format for all HTTP exceptions
  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', '*'),
    credentials: true,
  });

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
