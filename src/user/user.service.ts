import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User as UserSchema, UserDocument } from '@/database/schemas/user.schema';
import { User } from './user.entity';
import { IUser, ICreateUser } from './interfaces/user.interface';
import { CacheService } from '@/cache/cache.service';
import { toCachedUser } from '@/cache/interfaces/cache.interface';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly bcryptRounds: number;

  constructor(
    @InjectModel(UserSchema.name) private userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    // Explicitly parse as number - env vars are strings, bcrypt needs a number
    const rounds = this.configService.get<string | number>('BCRYPT_ROUNDS', 12);
    this.bcryptRounds = typeof rounds === 'string' ? parseInt(rounds, 10) : rounds;
  }

  /**
   * Convert MongoDB document to IUser interface
   */
  private toIUser(doc: UserDocument): IUser {
    return {
      id: doc._id.toString(),
      email: doc.email,
      passwordHash: doc.passwordHash,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /**
   * Validate if string is a valid MongoDB ObjectId
   */
  private isValidObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }

  /**
   * Create a new user
   */
  async create(createUserDto: ICreateUser): Promise<User> {
    const email = createUserDto.email.toLowerCase();

    // Check if email already exists
    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    try {
      const userDoc = new this.userModel({
        email,
        passwordHash: await bcrypt.hash(createUserDto.password, this.bcryptRounds),
      });

      const saved = await userDoc.save();
      const user = this.toIUser(saved);

      // Populate cache with new user
      this.cacheService.setUser(toCachedUser(user));

      this.logger.debug(`User ${user.id} created in MongoDB`);
      return new User(user);
    } catch (error: unknown) {
      // Handle duplicate key error (race condition)
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    // Validate ObjectId format
    if (!this.isValidObjectId(id)) {
      return null;
    }

    // Check cache first
    const cached = this.cacheService.getUser(id);
    if (cached) {
      this.logger.debug(`User ${id} found in cache`);
      return new User(cached);
    }

    // Cache miss - query MongoDB
    const doc = await this.userModel.findById(id);
    if (!doc) {
      return null;
    }

    const user = this.toIUser(doc);

    // Populate cache
    this.cacheService.setUser(toCachedUser(user));
    this.logger.debug(`User ${id} found in MongoDB, cached`);

    return new User(user);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase();

    // Check email->id cache first
    const cachedUserId = this.cacheService.getUserIdByEmail(normalizedEmail);
    if (cachedUserId) {
      this.logger.debug(`Email ${normalizedEmail} found in cache, userId: ${cachedUserId}`);
      return this.findById(cachedUserId);
    }

    // Cache miss - query MongoDB
    const doc = await this.userModel.findOne({ email: normalizedEmail });
    if (!doc) {
      return null;
    }

    const user = this.toIUser(doc);

    // Populate cache
    this.cacheService.setUser(toCachedUser(user));
    this.logger.debug(`User found by email in MongoDB, cached`);

    return new User(user);
  }

  /**
   * Validate user password
   */
  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    if (!this.isValidObjectId(userId)) {
      throw new NotFoundException('User not found');
    }

    const doc = await this.userModel.findById(userId);
    if (!doc) {
      throw new NotFoundException('User not found');
    }

    doc.passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds);
    const updated = await doc.save();
    const user = this.toIUser(updated);

    // Invalidate and refresh cache (password changed = security event)
    this.cacheService.invalidateUser(userId, user.email);
    this.cacheService.setUser(toCachedUser(user));
    // Also invalidate all tokens for this user (password change should invalidate sessions)
    this.cacheService.invalidateAllTokensForUser(userId);

    this.logger.debug(`User ${userId} password updated`);
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<boolean> {
    if (!this.isValidObjectId(userId)) {
      return false;
    }

    const doc = await this.userModel.findById(userId);
    if (!doc) {
      return false;
    }

    const email = doc.email;

    // Invalidate cache first
    this.cacheService.invalidateUser(userId, email);
    this.cacheService.invalidateAllTokensForUser(userId);

    // Delete from MongoDB
    await this.userModel.deleteOne({ _id: userId });

    this.logger.debug(`User ${userId} deleted`);
    return true;
  }

  /**
   * Check if MongoDB is being used (always true now)
   */
  isUsingRedis(): boolean {
    // Keep for backwards compatibility - now always uses MongoDB
    return false;
  }

  /**
   * Check if using MongoDB
   */
  isUsingMongoDB(): boolean {
    return true;
  }

  /**
   * Clear all users (for testing purposes only)
   */
  async clearAllUsers(): Promise<void> {
    // Clear cache first
    this.cacheService.clearAll();

    // Clear MongoDB collection
    await this.userModel.deleteMany({});

    this.logger.warn('All users cleared from MongoDB');
  }
}
