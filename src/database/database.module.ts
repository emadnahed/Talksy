import { Global, Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * Global Database Module for MongoDB connection
 * Provides MongoDB connection pool shared across all modules
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const enabled =
          configService.get<boolean | string>('MONGODB_ENABLED', true) === true ||
          configService.get<boolean | string>('MONGODB_ENABLED', true) === 'true';

        if (!enabled) {
          // Return empty config - will be handled by module initialization
          return {
            uri: 'mongodb://localhost:27017/talksy-disabled',
          };
        }

        const uri = configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/talksy',
        );

        return {
          uri,
          retryAttempts: 3,
          retryDelay: 1000,
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
        };
      },
    }),
  ],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const enabled =
      this.configService.get<boolean | string>('MONGODB_ENABLED', true) === true ||
      this.configService.get<boolean | string>('MONGODB_ENABLED', true) === 'true';

    if (enabled) {
      const uri = this.configService.get<string>('MONGODB_URI', '');
      // Mask password in URI for logging
      const maskedUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
      this.logger.log(`MongoDB connection initialized: ${maskedUri}`);
    } else {
      this.logger.warn(
        'MongoDB disabled via configuration. This is only suitable for development/testing.',
      );
    }
  }
}
