import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { JwtGuard } from '../auth/jwt.guard';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, JwtGuard],
})
export class ProfileModule {}
