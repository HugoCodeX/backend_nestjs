import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  console.log('PORT:', process.env.PORT);

  await app.listen(process.env.PORT ?? 3000);
  console.log(
    `API Gateway running on http://localhost:${process.env.PORT ?? 3000}`,
  );
}
void bootstrap();
