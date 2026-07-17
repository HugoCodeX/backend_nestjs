import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

const required = [
  'DATABASE_URL',
  'BETTER_AUTH_URL',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`${name} is required for profile-service to start`);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);
  Logger.log(
    `Profile service running on http://localhost:${port}`,
    'Bootstrap',
  );
}
void bootstrap();
