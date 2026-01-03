import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configValidationSchema } from './config/config.schema';
import { GatewayModule } from './gateway/gateway.module';
import { SessionModule } from './session/session.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: configValidationSchema,
    }),
    EventEmitterModule.forRoot(),
    SessionModule,
    GatewayModule,
    ToolsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
