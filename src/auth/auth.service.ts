import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { UserService } from '@/user/user.service';
import { User } from '@/user/user.entity';
import { CacheService } from '@/cache/cache.service';
import { RedisPoolService } from '@/redis/redis-pool.service';
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
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTokens = new Map<string, { userId: string; expiresAt: Date }>();
  private readonly keyPrefix: string;
  private readonly accessTokenExpirySec: number;
  private readonly refreshTokenExpirySec: number;
  private readonly refreshTokenExpiryMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly cacheService: CacheService,
    private readonly redisPool: RedisPoolService,
  ) {
    this.keyPrefix = this.configService.get<string>('REDIS_KEY_PREFIX', 'talksy:');
    const accessExpiry = this.configService.get<string>('JWT_ACCESS_EXPIRY', '15m');
    const refreshExpiry = this.configService.get<string>('JWT_REFRESH_EXPIRY', '7d');
    this.accessTokenExpirySec = Math.floor(this.parseExpiryToMs(accessExpiry) / 1000);
    this.refreshTokenExpirySec = Math.floor(this.parseExpiryToMs(refreshExpiry) / 1000);
    this.refreshTokenExpiryMs = this.refreshTokenExpirySec * 1000;

    if (!this.redisPool.isEnabled()) {
      this.logger.warn(
        'Redis disabled, using in-memory refresh token storage. ' +
        'WARNING: Refresh tokens will NOT persist across restarts and will NOT be shared across instances. ' +
        'This mode is ONLY suitable for development/testing with a single instance.'
      );
    }
  }

  /**
   * Check if Redis is available for use
   */
  private isRedisAvailable(): boolean {
    return this.redisPool.isAvailable();
  }

  private parseExpiryToMs(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);

    if (isNaN(value) || value <= 0) {
      this.logger.error(`Invalid expiry value: ${expiry}. Using secure default of 1 minute.`);
      return 60 * 1000; // Fail securely with short default
    }

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
        // Security: Don't default to long expiry if unit is unrecognized
        this.logger.error(
          `Unrecognized expiry unit '${unit}' in '${expiry}'. ` +
          `Valid units: s (seconds), m (minutes), h (hours), d (days). ` +
          `Using secure default of 1 minute.`
        );
        return 60 * 1000; // Fail securely with short default (1 minute)
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

      // Invalidate all cached tokens for this user (security best practice)
      this.cacheService.invalidateAllTokensForUser(payload.sub);

      this.logger.debug(`User ${payload.sub} logged out`);
    } catch {
      // Token already invalid or expired, nothing to revoke
      this.logger.debug('Logout called with invalid token');
    }
  }

  async validateAccessToken(token: string): Promise<IAuthUser | null> {
    // Check cache first
    const cached = this.cacheService.getTokenValidation(token);
    if (cached) {
      return cached;
    }

    // Cache miss - verify JWT
    try {
      const payload = this.jwtService.verify<IJwtPayload>(token);
      const authUser: IAuthUser = {
        userId: payload.sub,
        email: payload.email,
      };

      // Cache the result with TTL based on remaining token lifetime
      if (payload.exp) {
        const remainingMs = (payload.exp * 1000) - Date.now();
        if (remainingMs > 0) {
          this.cacheService.setTokenValidation(token, authUser, remainingMs);
        }
      } else {
        // No exp claim, use default TTL
        this.cacheService.setTokenValidation(token, authUser);
      }

      return authUser;
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
    const client = this.redisPool.getClient();

    if (client) {
      try {
        await client.set(
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
      }
    }

    this.refreshTokens.set(tokenId, { userId, expiresAt });
  }

  private async isRefreshTokenValid(tokenId: string): Promise<boolean> {
    const client = this.redisPool.getClient();

    if (client) {
      try {
        const result = await client.exists(this.getRefreshTokenKey(tokenId));
        return result > 0;
      } catch (error) {
        this.logger.warn(
          `Redis error checking refresh token, using in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
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
    const client = this.redisPool.getClient();

    if (client) {
      try {
        await client.del(this.getRefreshTokenKey(tokenId));
        return;
      } catch (error) {
        this.logger.warn(
          `Redis error revoking refresh token, using in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.refreshTokens.delete(tokenId);
  }

  // For testing purposes
  async clearAllTokens(): Promise<void> {
    const client = this.redisPool.getClient();

    if (client) {
      try {
        const keys = await client.keys(`${this.keyPrefix}refresh:*`);
        if (keys.length > 0) {
          await client.del(...keys);
        }
      } catch (error) {
        this.logger.warn(`Failed to clear Redis refresh tokens: ${error}`);
      }
    }
    this.refreshTokens.clear();
  }
}
