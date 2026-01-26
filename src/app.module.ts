import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configValidationSchema } from './config/config.schema';
import { GatewayModule } from './gateway/gateway.module';
import { SessionModule } from './session/session.module';
import { ToolsModule } from './tools/tools.module';
import { StorageModule } from './storage/storage.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { AIModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { LoggingMiddleware } from './common/middleware/logging.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: configValidationSchema,
    }),
    EventEmitterModule.forRoot(),
    StorageModule,
    RateLimitModule,
    UserModule,
    AuthModule,
    SessionModule,
    AIModule,
    GatewayModule,
    ToolsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggingMiddleware)
      .forRoutes('*'); // Apply to all routes
  }
}