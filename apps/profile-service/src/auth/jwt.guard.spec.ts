import 'reflect-metadata';

// Mockear jwks antes de importar el guard
const mockJwksFn = jest.fn();
jest.mock('./jwks', () => ({
  JWKS: (...args: unknown[]) => mockJwksFn(...args),
}));

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { JwtGuard } from './jwt.guard';

describe('JwtGuard', () => {
  let guard: JwtGuard;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let publicKey: Awaited<ReturnType<typeof generateKeyPair>>['publicKey'];
  const ISSUER = 'https://test.example.com';
  const AUDIENCE = 'test-audience';
  const KID = 'test-kid-1';

  beforeAll(async () => {
    process.env.JWT_ISSUER = ISSUER;
    process.env.JWT_AUDIENCE = AUDIENCE;

    const keys = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;
    const jwk = await exportJWK(publicKey);
    jwk.kid = KID;
    jwk.alg = 'EdDSA';
    mockJwksFn.mockResolvedValue(jwk);
  });

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [JwtGuard],
    }).compile();
    guard = moduleRef.get(JwtGuard);
  });

  function makeContext(authHeader: string | undefined): ExecutionContext {
    const req = { headers: { authorization: authHeader } } as never;
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => JwtGuard,
    } as unknown as ExecutionContext;
  }

  async function signToken(opts: {
    sub?: string;
    aud?: string;
    iss?: string;
    expiresIn?: string | number;
    exp?: number;
    iat?: number;
  }) {
    let builder = new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setSubject(opts.sub ?? 'user-123')
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? AUDIENCE);
    if (opts.iat !== undefined) builder = builder.setIssuedAt(opts.iat);
    if (opts.exp !== undefined) builder = builder.setExpirationTime(opts.exp);
    else if (opts.expiresIn) builder = builder.setExpirationTime(opts.expiresIn as never);
    return builder.sign(privateKey);
  }

  it('valida un token correcto y setea req.user.sub', async () => {
    const token = await signToken({ sub: 'user-abc' });
    const req = { headers: { authorization: `Bearer ${token}` } } as never;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.user).toEqual({ sub: 'user-abc' });
    expect(mockJwksFn).toHaveBeenCalled();
  });

  it('rechaza request sin Authorization', async () => {
    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza Authorization sin prefijo "Bearer "', async () => {
    await expect(guard.canActivate(makeContext('Token abc'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza Bearer vacío', async () => {
    await expect(guard.canActivate(makeContext('Bearer '))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza token con formato inválido', async () => {
    await expect(
      guard.canActivate(makeContext('Bearer not-a-jwt')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza token expirado', async () => {
    const token = await signToken({
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(
      guard.canActivate(makeContext(`Bearer ${token}`)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza token con audience incorrecta', async () => {
    const token = await signToken({ aud: 'wrong-aud' });
    await expect(
      guard.canActivate(makeContext(`Bearer ${token}`)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza token con issuer incorrecto', async () => {
    const token = await signToken({ iss: 'https://evil.com' });
    await expect(
      guard.canActivate(makeContext(`Bearer ${token}`)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza token sin sub claim', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(
      guard.canActivate(makeContext(`Bearer ${token}`)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza token con sub no-string (numérico)', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setSubject(123 as unknown as string)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(
      guard.canActivate(makeContext(`Bearer ${token}`)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('acepta tokens con leve clock skew (clockTolerance: 30s)', async () => {
    // Token expirado hace 10 segundos (dentro de la tolerancia de 30s)
    const token = await signToken({
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    const req = { headers: { authorization: `Bearer ${token}` } } as never;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
