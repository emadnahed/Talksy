import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { InMemoryStorageAdapter } from './adapters/in-memory-storage.adapter';
import { RedisStorageAdapter } from './adapters/redis-storage.adapter';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [InMemoryStorageAdapter, RedisStorageAdapter, StorageService],
  exports: [StorageService, InMemoryStorageAdapter, RedisStorageAdapter],
})
export class StorageModule {}
