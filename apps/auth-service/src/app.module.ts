import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from '@auth-profile/auth';
import { HealthModule } from './health.controller';

@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      disableTrustedOriginsCors: true,
      disableGlobalAuthGuard: true,
    }),
    HealthModule,
  ],
})
export class AppModule {}
