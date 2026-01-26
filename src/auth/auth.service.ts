import {
  Injectable,
  Logger,
  UnauthorizedException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { UserService } from '@/user/user.service';
import { User } from '@/user/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { IJwtPayload, IRefreshTokenPayload } from './interfaces/jwt-payload.interface';
import { IAuthUser } from './interfaces/auth-user.interface';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse extends AuthTokens {
  user: {
    id: string;
    email: string;
  };
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private redisClient: Redis | null = null;
  private readonly refreshTokens = new Map<string, { userId: string; expiresAt: Date }>();
  private readonly keyPrefix: string;
  private readonly accessTokenExpirySec: number;
  private readonly refreshTokenExpirySec: number;
  private readonly refreshTokenExpiryMs: number;
  private isRedisConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {
    this.keyPrefix = this.configService.get<string>('REDIS_KEY_PREFIX', 'talksy:');
    const accessExpiry = this.configService.get<string>('JWT_ACCESS_EXPIRY', '15m');
    const refreshExpiry = this.configService.get<string>('JWT_REFRESH_EXPIRY', '7d');
    this.accessTokenExpirySec = Math.floor(this.parseExpiryToMs(accessExpiry) / 1000);
    this.refreshTokenExpirySec = Math.floor(this.parseExpiryToMs(refreshExpiry) / 1000);
    this.refreshTokenExpiryMs = this.refreshTokenExpirySec * 1000;
  }

  async onModuleInit(): Promise<void> {
    await this.initializeRedis();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
      this.isRedisConnected = false;
    }
  }

  private async initializeRedis(): Promise<void> {
    const redisEnabled =
      this.configService.get<boolean | string>('REDIS_ENABLED', false) === true ||
      this.configService.get<boolean | string>('REDIS_ENABLED', false) === 'true';

    if (!redisEnabled) {
      this.logger.log('Redis disabled, using in-memory refresh token storage');
      return;
    }

    try {
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);
      const password = this.configService.get<string>('REDIS_PASSWORD', '');
      const db = this.configService.get<number>('REDIS_DB', 0);

      this.redisClient = new Redis({
        host,
        port,
        password: password || undefined,
        db,
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 3,
      });

      await this.redisClient.connect();
      this.isRedisConnected = true;
      this.logger.log('Auth service connected to Redis for refresh tokens');
    } catch (error) {
      this.logger.warn(
        `Failed to connect to Redis for auth: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.redisClient = null;
      this.isRedisConnected = false;
    }
  }

  private parseExpiryToMs(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000; // Default 7 days
    }
  }

  private getRefreshTokenKey(tokenId: string): string {
    return `${this.keyPrefix}refresh:${tokenId}`;
  }

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const user = await this.userService.create({
      email: registerDto.email,
      password: registerDto.password,
    });

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: user.toPublic(),
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.userService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.userService.validatePassword(
      user,
      loginDto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: user.toPublic(),
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = this.jwtService.verify<IRefreshTokenPayload>(refreshToken);

      // Check if refresh token is still valid (not revoked)
      const isValid = await this.isRefreshTokenValid(payload.tokenId);
      if (!isValid) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      const user = await this.userService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Revoke old refresh token (rotation)
      await this.revokeRefreshToken(payload.tokenId);

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwtService.verify<IRefreshTokenPayload>(refreshToken);
      await this.revokeRefreshToken(payload.tokenId);
      this.logger.debug(`User ${payload.sub} logged out`);
    } catch {
      // Token already invalid or expired, nothing to revoke
      this.logger.debug('Logout called with invalid token');
    }
  }

  async validateAccessToken(token: string): Promise<IAuthUser | null> {
    try {
      const payload = this.jwtService.verify<IJwtPayload>(token);
      return {
        userId: payload.sub,
        email: payload.email,
      };
    } catch {
      return null;
    }
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    const tokenId = uuidv4();

    const accessTokenPayload: IJwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const refreshTokenPayload: IRefreshTokenPayload = {
      sub: user.id,
      tokenId,
    };

    const accessToken = this.jwtService.sign(accessTokenPayload, {
      expiresIn: this.accessTokenExpirySec,
    });

    const refreshToken = this.jwtService.sign(refreshTokenPayload, {
      expiresIn: this.refreshTokenExpirySec,
    });

    // Store refresh token for validation/revocation
    await this.storeRefreshToken(tokenId, user.id);

    // Calculate expiry in seconds for client
    const expiresIn = this.accessTokenExpirySec;

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(expiresIn),
    };
  }

  private async storeRefreshToken(tokenId: string, userId: string): Promise<void> {
    const expiresAt = new Date(Date.now() + this.refreshTokenExpiryMs);

    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.set(
          this.getRefreshTokenKey(tokenId),
          userId,
          'PX',
          this.refreshTokenExpiryMs,
        );
        return;
      } catch (error) {
        this.logger.warn(
          `Redis error storing refresh token, using in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.isRedisConnected = false;
      }
    }

    this.refreshTokens.set(tokenId, { userId, expiresAt });
  }

  private async isRefreshTokenValid(tokenId: string): Promise<boolean> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        const result = await this.redisClient.exists(this.getRefreshTokenKey(tokenId));
        return result > 0;
      } catch (error) {
        this.logger.warn(
          `Redis error checking refresh token, using in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.isRedisConnected = false;
      }
    }

    const token = this.refreshTokens.get(tokenId);
    if (!token) return false;

    if (token.expiresAt < new Date()) {
      this.refreshTokens.delete(tokenId);
      return false;
    }

    return true;
  }

  private async revokeRefreshToken(tokenId: string): Promise<void> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.del(this.getRefreshTokenKey(tokenId));
        return;
      } catch (error) {
        this.logger.warn(
          `Redis error revoking refresh token, using in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.isRedisConnected = false;
      }
    }

    this.refreshTokens.delete(tokenId);
  }

  // For testing purposes
  async clearAllTokens(): Promise<void> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        const keys = await this.redisClient.keys(`${this.keyPrefix}refresh:*`);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } catch (error) {
        this.logger.warn(`Failed to clear Redis refresh tokens: ${error}`);
      }
    }
    this.refreshTokens.clear();
  }
}
