import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisPoolService } from './redis-pool.service';

/**
 * Global Redis module providing shared connection pool
 * Import once in AppModule - available everywhere
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisPoolService],
  exports: [RedisPoolService],
})
export class RedisModule {}
