import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { HealthCheckDto } from './common/dto/health-check.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return this.appService.getHealth();
  }

  @Get('health/detailed')
  getDetailedHealth(): Promise<HealthCheckDto> {
    return this.appService.getDetailedHealth();
  }
}
