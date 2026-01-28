import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Connection, Types } from 'mongoose';
import { User, UserSchema, UserDocument } from './user.schema';

describe('UserSchema', () => {
  let module: TestingModule;
  let mongoServer: MongoMemoryServer;
  let userModel: Model<UserDocument>;
  let connection: Connection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
      ],
    }).compile();

    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
    connection = module.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await module.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await userModel.deleteMany({});
  });

  describe('Schema Definition', () => {
    it('should have correct collection name', () => {
      expect(userModel.collection.name).toBe('users');
    });

    it('should create user with all required fields', async () => {
      const user = await userModel.create({
        email: 'test@example.com',
        passwordHash: 'hashed-password',
      });

      expect(user._id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.passwordHash).toBe('hashed-password');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Email Field', () => {
    it('should require email field', async () => {
      await expect(
        userModel.create({
          passwordHash: 'hashed-password',
        }),
      ).rejects.toThrow();
    });

    it('should enforce unique email constraint', async () => {
      await userModel.create({
        email: 'unique@example.com',
        passwordHash: 'hash1',
      });

      await expect(
        userModel.create({
          email: 'unique@example.com',
          passwordHash: 'hash2',
        }),
      ).rejects.toThrow();
    });

    it('should convert email to lowercase', async () => {
      const user = await userModel.create({
        email: 'UPPERCASE@EXAMPLE.COM',
        passwordHash: 'hashed-password',
      });

      expect(user.email).toBe('uppercase@example.com');
    });

    it('should trim whitespace from email', async () => {
      const user = await userModel.create({
        email: '  spaces@example.com  ',
        passwordHash: 'hashed-password',
      });

      expect(user.email).toBe('spaces@example.com');
    });

    it('should have email index', async () => {
      const indexes = await userModel.collection.indexes();
      const emailIndex = indexes.find(
        (idx) => idx.key && idx.key.email !== undefined,
      );

      expect(emailIndex).toBeDefined();
      expect(emailIndex?.unique).toBe(true);
    });
  });

  describe('PasswordHash Field', () => {
    it('should require passwordHash field', async () => {
      await expect(
        userModel.create({
          email: 'test@example.com',
        }),
      ).rejects.toThrow();
    });

    it('should store passwordHash as string', async () => {
      const user = await userModel.create({
        email: 'test@example.com',
        passwordHash: '$2b$12$hashedvalue',
      });

      expect(typeof user.passwordHash).toBe('string');
      expect(user.passwordHash).toBe('$2b$12$hashedvalue');
    });
  });

  describe('Timestamps', () => {
    it('should auto-generate createdAt', async () => {
      const beforeCreate = new Date();
      const user = await userModel.create({
        email: 'timestamp@example.com',
        passwordHash: 'hashed-password',
      });
      const afterCreate = new Date();

      expect(user.createdAt).toBeDefined();
      expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(user.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    it('should auto-generate updatedAt', async () => {
      const user = await userModel.create({
        email: 'timestamp@example.com',
        passwordHash: 'hashed-password',
      });

      expect(user.updatedAt).toBeDefined();
      expect(user.updatedAt.getTime()).toBe(user.createdAt.getTime());
    });

    it('should update updatedAt on modification', async () => {
      const user = await userModel.create({
        email: 'timestamp@example.com',
        passwordHash: 'hashed-password',
      });

      const originalUpdatedAt = user.updatedAt;

      // Wait to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      user.passwordHash = 'new-hashed-password';
      await user.save();

      expect(user.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should not update createdAt on modification', async () => {
      const user = await userModel.create({
        email: 'timestamp@example.com',
        passwordHash: 'hashed-password',
      });

      const originalCreatedAt = user.createdAt;

      user.passwordHash = 'new-hashed-password';
      await user.save();

      expect(user.createdAt.getTime()).toBe(originalCreatedAt.getTime());
    });
  });

  describe('ObjectId', () => {
    it('should auto-generate valid ObjectId', async () => {
      const user = await userModel.create({
        email: 'objectid@example.com',
        passwordHash: 'hashed-password',
      });

      expect(user._id).toBeDefined();
      expect(Types.ObjectId.isValid(user._id)).toBe(true);
    });

    it('should allow custom ObjectId', async () => {
      const customId = new Types.ObjectId();
      const user = await userModel.create({
        _id: customId,
        email: 'customid@example.com',
        passwordHash: 'hashed-password',
      });

      expect(user._id.toString()).toBe(customId.toString());
    });
  });

  describe('Document Methods', () => {
    it('should convert to plain object', async () => {
      const user = await userModel.create({
        email: 'toobject@example.com',
        passwordHash: 'hashed-password',
      });

      const plainObject = user.toObject();

      expect(plainObject._id).toBeDefined();
      expect(plainObject.email).toBe('toobject@example.com');
      expect(plainObject.passwordHash).toBe('hashed-password');
    });

    it('should convert to JSON', async () => {
      const user = await userModel.create({
        email: 'tojson@example.com',
        passwordHash: 'hashed-password',
      });

      const json = user.toJSON();

      expect(json._id).toBeDefined();
      expect(json.email).toBe('tojson@example.com');
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await Promise.all([
        userModel.create({ email: 'user1@example.com', passwordHash: 'hash1' }),
        userModel.create({ email: 'user2@example.com', passwordHash: 'hash2' }),
        userModel.create({ email: 'user3@example.com', passwordHash: 'hash3' }),
      ]);
    });

    it('should find by ID', async () => {
      const created = await userModel.create({
        email: 'findme@example.com',
        passwordHash: 'hash',
      });

      const found = await userModel.findById(created._id);
      expect(found).toBeDefined();
      expect(found!.email).toBe('findme@example.com');
    });

    it('should find one by email', async () => {
      const found = await userModel.findOne({ email: 'user2@example.com' });
      expect(found).toBeDefined();
      expect(found!.passwordHash).toBe('hash2');
    });

    it('should find all users', async () => {
      const users = await userModel.find({});
      expect(users.length).toBe(3);
    });

    it('should count documents', async () => {
      const count = await userModel.countDocuments({});
      expect(count).toBe(3);
    });

    it('should support lean queries', async () => {
      const user = await userModel.findOne({ email: 'user1@example.com' }).lean();
      expect(user).toBeDefined();
      expect(typeof user!.save).toBe('undefined'); // Lean objects don't have mongoose methods
    });
  });

  describe('UserDocument Interface', () => {
    it('should match UserDocument interface', async () => {
      const user: UserDocument = await userModel.create({
        email: 'interface@example.com',
        passwordHash: 'hashed-password',
      });

      // Type checks
      const id: Types.ObjectId = user._id;
      const email: string = user.email;
      const passwordHash: string = user.passwordHash;
      const createdAt: Date = user.createdAt;
      const updatedAt: Date = user.updatedAt;

      expect(id).toBeDefined();
      expect(typeof email).toBe('string');
      expect(typeof passwordHash).toBe('string');
      expect(createdAt).toBeInstanceOf(Date);
      expect(updatedAt).toBeInstanceOf(Date);
    });
  });
});
