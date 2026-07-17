import { Controller, Get, Module } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'auth-service' };
  }
}

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
