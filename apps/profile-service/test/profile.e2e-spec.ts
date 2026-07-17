import 'reflect-metadata';

// IMPORTANTE: jest.mock debe ir antes de cualquier import del módulo que usa JWKS
const mockJwksFn = jest.fn();
jest.mock('../src/auth/jwks', () => ({
  JWKS: (...args: unknown[]) => mockJwksFn(...args),
}));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SignJWT } from 'jose';
import { AppModule } from '../src/app.module';
import {
  setup,
  teardown,
  getTestKeys,
  getTestPublicJwk,
} from './setup-e2e';

describe('Profile e2e', () => {
  let app: INestApplication<App>;
  let aliceSub: string;
  let bobSub: string;
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
    await setup();

    // Configurar el mock del JWKS para que devuelva nuestra clave pública
    const publicJwk = await getTestPublicJwk();
    mockJwksFn.mockResolvedValue(publicJwk);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();

    // Generar IDs y JWTs de prueba
    aliceSub = 'alice-user-id-001';
    bobSub = 'bob-user-id-002';
    const { privateKey, kid } = getTestKeys();
    const issuer = process.env.JWT_ISSUER ?? 'http://test.invalid';
    const audience = process.env.JWT_AUDIENCE ?? 'internal-services-test';

    aliceToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid })
      .setSubject(aliceSub)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    bobToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid })
      .setSubject(bobSub)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await teardown();
  }, 30_000);

  // ========================================================
  // CRÍTICO: cross-user authorization
  // ========================================================
  describe('Authorization (CRITICAL)', () => {
    it('User A NO puede actualizar el profile de User B', async () => {
      // 1) Bob crea su profile
      const bobRes = await request(app.getHttpServer())
        .patch('/api/profile')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ firstName: 'Bob', lastName: 'Original' })
        .expect(200);
      expect(bobRes.body.firstName).toBe('Bob');
      expect(bobRes.body.lastName).toBe('Original');

      // 2) Alice intenta cambiar el profile de Bob usando su propio JWT
      await request(app.getHttpServer())
        .patch('/api/profile')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ firstName: 'Hacked', lastName: 'ByAlice' })
        .expect(200);

      // 3) Bob consulta su profile y verifica que NO fue modificado
      const bobAfter = await request(app.getHttpServer())
        .get('/api/profile')
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      expect(bobAfter.body.firstName).toBe('Bob');
      expect(bobAfter.body.lastName).toBe('Original');
      expect(bobAfter.body.firstName).not.toBe('Hacked');
    });

    it('GET /api/profile con JWT de A devuelve el profile de A, no de B', async () => {
      // Asegurar que ambos tienen profiles con valores distintos
      await request(app.getHttpServer())
        .patch('/api/profile')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ firstName: 'Alice' })
        .expect(200);

      await request(app.getHttpServer())
        .patch('/api/profile')
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ firstName: 'Bob' })
        .expect(200);

      // Alice pide SU profile
      const aliceRes = await request(app.getHttpServer())
        .get('/api/profile')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);
      expect(aliceRes.body.firstName).toBe('Alice');
      expect(aliceRes.body.userId).toBe(aliceSub);

      // Bob pide SU profile
      const bobRes = await request(app.getHttpServer())
        .get('/api/profile')
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);
      expect(bobRes.body.firstName).toBe('Bob');
      expect(bobRes.body.userId).toBe(bobSub);
    });
  });

  // ========================================================
  // Validación de DTO
  // ========================================================
  describe('DTO validation', () => {
    it('rechaza campos desconocidos (forbidNonWhitelisted) con 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/profile')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ firstName: 'X', userId: 'malicious-id' });

      expect(res.status).toBe(400);
    });

    it('rechaza firstName > 100 chars con 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/profile')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ firstName: 'a'.repeat(101) });

      expect(res.status).toBe(400);
    });

    it('rechaza bio > 2000 chars con 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/profile')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ bio: 'a'.repeat(2001) });

      expect(res.status).toBe(400);
    });

    it('rechaza avatarUrl inválido con 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/profile')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ avatarUrl: 'http://' });

      expect(res.status).toBe(400);
    });

    it('trimea whitespace en strings', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/profile')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ firstName: '  Trimmed  ' })
        .expect(200);

      expect(res.body.firstName).toBe('Trimmed');
    });
  });

  // ========================================================
  // JWT validation
  // ========================================================
  describe('JWT validation', () => {
    it('rechaza request sin Authorization con 401', async () => {
      await request(app.getHttpServer())
        .get('/api/profile')
        .expect(401);
    });

    it('rechaza token con formato inválido con 401', async () => {
      await request(app.getHttpServer())
        .get('/api/profile')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });

    it('rechaza token expirado con 401', async () => {
      const { privateKey, kid } = getTestKeys();
      const expired = await new SignJWT({})
        .setProtectedHeader({ alg: 'EdDSA', kid })
        .setSubject(aliceSub)
        .setIssuer(process.env.JWT_ISSUER ?? 'http://test.invalid')
        .setAudience(process.env.JWT_AUDIENCE ?? 'internal-services-test')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // expirado hace 30min
        .sign(privateKey);

      const res = await request(app.getHttpServer())
        .get('/api/profile')
        .set('Authorization', `Bearer ${expired}`);

      expect(res.status).toBe(401);
    });

    it('rechaza token con audience incorrecta con 401', async () => {
      const { privateKey, kid } = getTestKeys();
      const wrongAud = await new SignJWT({})
        .setProtectedHeader({ alg: 'EdDSA', kid })
        .setSubject(aliceSub)
        .setIssuer(process.env.JWT_ISSUER ?? 'http://test.invalid')
        .setAudience('wrong-audience')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

      const res = await request(app.getHttpServer())
        .get('/api/profile')
        .set('Authorization', `Bearer ${wrongAud}`);

      expect(res.status).toBe(401);
    });

    it('rechaza token con issuer incorrecto con 401', async () => {
      const { privateKey, kid } = getTestKeys();
      const wrongIss = await new SignJWT({})
        .setProtectedHeader({ alg: 'EdDSA', kid })
        .setSubject(aliceSub)
        .setIssuer('https://evil.example.com')
        .setAudience(process.env.JWT_AUDIENCE ?? 'internal-services-test')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

      const res = await request(app.getHttpServer())
        .get('/api/profile')
        .set('Authorization', `Bearer ${wrongIss}`);

      expect(res.status).toBe(401);
    });
  });
});
