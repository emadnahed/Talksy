import {
  Injectable,
  NestMiddleware,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

export interface LogEntry {
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  contentLength: number;
  userAgent?: string;
  ip?: string;
  status: 'success' | 'error';
}

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly enabled: boolean;
  private readonly format: 'json' | 'text';

  constructor(
    @Optional() private readonly configService?: ConfigService,
  ) {
    // Fallback to default values if configService is not available
    this.enabled = configService?.get<boolean>('LOG_HTTP_REQUESTS', true) ?? true;
    this.format = (configService?.get<string>('LOG_FORMAT', 'json') ?? 'json') as 'json' | 'text';
  }

  use(req: Request, res: Response, next: NextFunction) {
    if (!this.enabled) {
      next();
      return;
    }

    const startTime = Date.now();
    const originalSend = res.send;

    // Override the response send method to capture response size
    res.send = (body: any) => {
      const responseTime = Date.now() - startTime;
      const contentLength = Buffer.byteLength(body || '');
      
      // Log the request after response is sent
      setImmediate(() => {
        this.logRequest({
          timestamp: new Date().toISOString(),
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          responseTime,
          contentLength,
          userAgent: req.get('User-Agent'),
          ip: req.ip || req.connection.remoteAddress,
          status: res.statusCode >= 400 ? 'error' : 'success',
        });
      });

      return originalSend.call(res, body);
    };

    next();
  }

  private logRequest(entry: LogEntry): void {
    if (this.format === 'json') {
      this.logger.log(JSON.stringify(entry));
    } else {
      const statusIcon = entry.status === 'success' ? '✓' : '✗';
      const statusColor = entry.statusCode >= 400 ? 'red' : entry.statusCode >= 300 ? 'yellow' : 'green';
      const colorCode = statusColor === 'red' ? '\x1b[31m' : statusColor === 'yellow' ? '\x1b[33m' : '\x1b[32m';
      const resetCode = '\x1b[0m';
      
      const message = `${statusIcon} ${colorCode}${entry.method} ${entry.url}${resetCode} ${entry.statusCode} ${entry.responseTime}ms (${entry.contentLength}b)`;

      if (entry.status === 'error') {
        this.logger.error(message);
      } else {
        this.logger.log(message);
      }
    }
  }
}