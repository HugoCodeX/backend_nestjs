import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const required = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'FRONTEND_URL',
  'JWT_AUDIENCE',
];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`${name} is required for auth-service to start`);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // CRÍTICO: debe ser false. Better Auth lee el body crudo del stream
    // (lo necesita porque el handler está montado como middleware Express
    // vía httpAdapter.use(), no como ruta NestJS, por lo que SkipBodyParsingMiddleware
    // no aplica). Si se cambia a true, el body parser default consume el stream
    // antes de que Better Auth pueda leerlo y todas las requests a /api/auth/* fallan.
    bodyParser: false,
  });

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`Auth service running on http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
