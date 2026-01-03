import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, tap } from 'rxjs';
import { Socket } from 'socket.io';

interface LogEntry {
  timestamp: string;
  clientId: string;
  event: string;
  duration?: number;
  payloadSize?: number;
  status: 'success' | 'error';
  error?: string;
}

@Injectable()
export class WsLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(WsLoggingInterceptor.name);
  private readonly enabled: boolean;
  private readonly format: 'json' | 'text';

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('LOG_WS_EVENTS', true);
    this.format =
      (this.configService.get<string>('LOG_FORMAT', 'json') as 'json' | 'text');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.enabled) {
      return next.handle();
    }

    const startTime = Date.now();
    const client: Socket = context.switchToWs().getClient();
    const data = context.switchToWs().getData();
    const pattern = context.switchToWs().getPattern();

    const clientId = client.id;
    const event = typeof pattern === 'string' ? pattern : String(pattern);
    const payloadSize = this.getPayloadSize(data);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logEvent({
            timestamp: new Date().toISOString(),
            clientId,
            event,
            duration,
            payloadSize,
            status: 'success',
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logEvent({
            timestamp: new Date().toISOString(),
            clientId,
            event,
            duration,
            payloadSize,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        },
      }),
    );
  }

  private getPayloadSize(data: unknown): number {
    if (data === null || data === undefined) {
      return 0;
    }

    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }

  private logEvent(entry: LogEntry): void {
    if (this.format === 'json') {
      this.logger.log(JSON.stringify(entry));
    } else {
      const statusIcon = entry.status === 'success' ? '✓' : '✗';
      const errorPart = entry.error ? ` - ${entry.error}` : '';
      const message = `${statusIcon} [${entry.clientId}] ${entry.event} ${entry.duration}ms (${entry.payloadSize}b)${errorPart}`;

      if (entry.status === 'error') {
        this.logger.error(message);
      } else {
        this.logger.log(message);
      }
    }
  }
}
