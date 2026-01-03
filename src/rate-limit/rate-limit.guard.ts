import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(private readonly rateLimitService: RateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.rateLimitService.isEnabled()) {
      return true;
    }

    const client: Socket = context.switchToWs().getClient();
    const clientId = client.id;

    const result = this.rateLimitService.consume(clientId);

    if (!result.allowed) {
      this.logger.warn(
        `Rate limit exceeded for client ${clientId}. Retry after ${result.retryAfter}s`,
      );

      // Emit rate limit info to client before throwing
      client.emit('rate_limit', {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
        remaining: result.remaining,
        resetAt: result.resetAt,
        retryAfter: result.retryAfter,
      });

      throw new WsException({
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
      });
    }

    this.logger.debug(
      `Rate limit check passed for client ${clientId}: ${result.remaining} remaining`,
    );

    return true;
  }
}
