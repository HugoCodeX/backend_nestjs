import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import type { Express } from 'express';
import { AppModule } from './app.module';

const required = [
  'FRONTEND_URL',
  'AUTH_SERVICE_URL',
  'PROFILE_SERVICE_URL',
  'BETTER_AUTH_URL',
  'REDIS_URL',
];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`${name} is required for api-gateway to start`);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const httpAdapter = app.getHttpAdapter();
  const expressApp = httpAdapter.getInstance() as Express;

  expressApp.use(helmet());

  // trust proxy: solo proxies en redes privadas/loopback. Evita spoofing
  // de X-Forwarded-For para bypasear ThrottlerGuard (que usa req.ip).
  expressApp.set('trust proxy', 'loopback, linklocal, uniquelocal');

  app.enableCors({
    origin: [process.env.FRONTEND_URL!],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'X-Requested-With',
      'X-Request-Id',
    ],
  });

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API Gateway running on http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
