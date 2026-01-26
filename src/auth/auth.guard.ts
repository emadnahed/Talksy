import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from './auth.service';
import { IAuthUser } from './interfaces/auth-user.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly authEnabled: boolean;
  private readonly bypassInDev: boolean;
  private readonly isDev: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.authEnabled = this.configService.get<boolean>('AUTH_ENABLED', true);
    this.bypassInDev = this.configService.get<boolean>(
      'AUTH_BYPASS_IN_DEV',
      true,
    );
    this.isDev =
      this.configService.get<string>('NODE_ENV', 'development') ===
      'development';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // If auth is disabled, allow all requests
    if (!this.authEnabled) {
      return true;
    }

    const contextType = context.getType();

    // If in development and bypass is enabled, allow without token
    // but only if no token is provided
    if (this.isDev && this.bypassInDev) {
      // Try to validate if a token is provided
      if (contextType === 'http') {
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);
        this.logger.log(`Dev mode: extracted token: ${token ? 'present' : 'missing'}`);
        if (token) {
          // Token provided, validate it
          const user = await this.authService.validateAccessToken(token);
          this.logger.log(`Dev mode: validated user: ${JSON.stringify(user)}`);
          if (user) {
            request.user = user;
            this.logger.log(`Dev mode: attached user to request`);
            return true;
          }
          // Token invalid, but in dev mode allow anyway
          this.logger.log('Dev mode: token invalid, bypassing anyway');
        }
      } else if (contextType === 'ws') {
        const client: Socket = context.switchToWs().getClient();
        const token = this.extractTokenFromSocket(client);
        if (token) {
          const user = await this.authService.validateAccessToken(token);
          if (user) {
            client.data.user = user;
            return true;
          }
        }
      }
      this.logger.log('Auth bypassed in development mode (no token)');
      return true;
    }

    if (contextType === 'http') {
      return this.validateHttpRequest(context);
    } else if (contextType === 'ws') {
      return this.validateWsConnection(context);
    }

    return false;
  }

  private async validateHttpRequest(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    const user = await this.authService.validateAccessToken(token);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Attach user to request for use in controllers
    request.user = user;
    return true;
  }

  private async validateWsConnection(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractTokenFromSocket(client);

    if (!token) {
      this.logger.warn(
        `WebSocket connection rejected: Missing token from ${client.handshake.address}`,
      );
      throw new WsException({
        code: 'AUTH_MISSING_TOKEN',
        message: 'Authentication token is required',
      });
    }

    const user = await this.authService.validateAccessToken(token);
    if (!user) {
      this.logger.warn(
        `WebSocket connection rejected: Invalid token from ${client.handshake.address}`,
      );
      throw new WsException({
        code: 'AUTH_INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
    }

    // Attach user to socket data for use in gateway handlers
    client.data.user = user;
    this.logger.debug(
      `WebSocket connection authorized for user ${user.userId}`,
    );
    return true;
  }

  private extractTokenFromHeader(request: { headers: Record<string, string> }): string | null {
    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }

  private extractTokenFromSocket(client: Socket): string | null {
    // Check auth object first (preferred for Socket.IO)
    const authToken = client.handshake.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken;
    }

    // Fallback to Authorization header
    const authHeader = client.handshake.headers['authorization'];
    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        return token;
      }
    }

    // Fallback to query parameter
    const queryToken = client.handshake.query['token'];
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    return null;
  }
}

/**
 * Helper function to get authenticated user from WebSocket client
 */
export function getAuthUser(client: Socket): IAuthUser | null {
  return client.data?.user || null;
}
