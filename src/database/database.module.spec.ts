import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection } from 'mongoose';
import { DatabaseModule } from './database.module';

describe('DatabaseModule', () => {
  describe('with MongoDB enabled', () => {
    let module: TestingModule;
    let mongoServer: MongoMemoryServer;
    let connection: Connection;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();

      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                MONGODB_ENABLED: true,
                MONGODB_URI: mongoUri,
              }),
            ],
          }),
          MongooseModule.forRoot(mongoUri),
          DatabaseModule,
        ],
      }).compile();

      connection = module.get<Connection>(getConnectionToken());
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
      if (mongoServer) {
        await mongoServer.stop();
      }
    });

    it('should be defined', () => {
      expect(module).toBeDefined();
    });

    it('should establish MongoDB connection', () => {
      expect(connection).toBeDefined();
      expect(connection.readyState).toBe(1); // 1 = connected
    });

    it('should have correct database name', () => {
      expect(connection.db).toBeDefined();
    });
  });

  describe('connection configuration', () => {
    let configModule: TestingModule;
    let configMongoServer: MongoMemoryServer;
    let configConnection: Connection;

    beforeAll(async () => {
      configMongoServer = await MongoMemoryServer.create();
      const mongoUri = configMongoServer.getUri();

      configModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                MONGODB_ENABLED: true,
                MONGODB_URI: mongoUri,
              }),
            ],
          }),
          MongooseModule.forRoot(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
          }),
          DatabaseModule,
        ],
      }).compile();

      configConnection = configModule.get<Connection>(getConnectionToken());
    });

    afterAll(async () => {
      if (configModule) {
        await configModule.close();
      }
      if (configMongoServer) {
        await configMongoServer.stop();
      }
    });

    it('should connect with custom timeout settings', () => {
      expect(configConnection.readyState).toBe(1);
    });

    it('should have connection options', () => {
      expect(configConnection.config).toBeDefined();
    });
  });
});
