import { Global, Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

/**
 * Check if MongoDB is enabled from config
 * Handles both boolean and string values from environment variables
 */
function isMongoEnabled(configService: ConfigService): boolean {
  return String(configService.get('MONGODB_ENABLED', 'true')) === 'true';
}

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
        const enabled = isMongoEnabled(configService);

        if (!enabled) {
          // Return a config that will fail fast and quietly if MongoDB is disabled
          return {
            uri: 'mongodb://localhost:59999/disabled',
            serverSelectionTimeoutMS: 1,
            connectTimeoutMS: 1,
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
    const enabled = isMongoEnabled(this.configService);

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
