import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configValidationSchema } from './config/config.schema';
import { GatewayModule } from './gateway/gateway.module';
import { SessionModule } from './session/session.module';
import { StorageModule } from './storage/storage.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { AIModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: configValidationSchema,
    }),
    StorageModule,
    RateLimitModule,
    SessionModule,
    AIModule,
    GatewayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
