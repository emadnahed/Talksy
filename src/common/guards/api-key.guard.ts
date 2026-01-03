import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly validApiKeys: Set<string>;
  private readonly authEnabled: boolean;
  private readonly bypassInDev: boolean;
  private readonly isDev: boolean;

  constructor(private readonly configService: ConfigService) {
    this.authEnabled = this.configService.get<boolean>('AUTH_ENABLED', true);
    this.bypassInDev = this.configService.get<boolean>(
      'AUTH_BYPASS_IN_DEV',
      true,
    );
    this.isDev =
      this.configService.get<string>('NODE_ENV', 'development') ===
      'development';

    // Parse comma-separated API keys
    const apiKeysStr = this.configService.get<string>('API_KEYS', '');
    this.validApiKeys = new Set(
      apiKeysStr
        .split(',')
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    );

    if (this.authEnabled && this.validApiKeys.size === 0 && !this.bypassInDev) {
      this.logger.warn(
        'API key authentication is enabled but no API keys are configured',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    // If auth is disabled, allow all connections
    if (!this.authEnabled) {
      return true;
    }

    // If in development and bypass is enabled, allow without key
    if (this.isDev && this.bypassInDev) {
      this.logger.debug('Auth bypassed in development mode');
      return true;
    }

    const client: Socket = context.switchToWs().getClient();
    const apiKey = this.extractApiKey(client);

    if (!apiKey) {
      this.logger.warn(
        `Connection rejected: Missing API key from ${client.handshake.address}`,
      );
      throw new WsException({
        code: 'AUTH_MISSING_KEY',
        message: 'API key is required',
      });
    }

    if (!this.validateApiKey(apiKey)) {
      this.logger.warn(
        `Connection rejected: Invalid API key from ${client.handshake.address}`,
      );
      throw new WsException({
        code: 'AUTH_INVALID_KEY',
        message: 'Invalid API key',
      });
    }

    this.logger.debug(`Connection authorized from ${client.handshake.address}`);
    return true;
  }

  private extractApiKey(client: Socket): string | null {
    // Check header first (preferred)
    const headerKey = client.handshake.headers['x-api-key'];
    if (headerKey && typeof headerKey === 'string') {
      return headerKey;
    }

    // Fallback to query parameter
    const queryKey = client.handshake.query['apiKey'];
    if (queryKey && typeof queryKey === 'string') {
      return queryKey;
    }

    // Check auth token in handshake
    const authToken = client.handshake.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken;
    }

    return null;
  }

  private validateApiKey(providedKey: string): boolean {
    if (this.validApiKeys.size === 0) {
      // No keys configured - reject in production, allow in dev with bypass
      return this.isDev && this.bypassInDev;
    }

    // Use constant-time comparison to prevent timing attacks
    for (const validKey of this.validApiKeys) {
      if (this.constantTimeCompare(providedKey, validKey)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      // Still need to do comparison work to maintain constant time
      const dummyBuffer = Buffer.alloc(Math.max(a.length, b.length));
      crypto.timingSafeEqual(dummyBuffer, dummyBuffer);
      return false;
    }

    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }
}
