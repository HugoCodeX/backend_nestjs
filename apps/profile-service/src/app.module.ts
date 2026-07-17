import { Module } from '@nestjs/common';
import { ProfileModule } from './profile/profile.module';
import { HealthModule } from './health.controller';

@Module({
  imports: [ProfileModule, HealthModule],
})
export class AppModule {}
