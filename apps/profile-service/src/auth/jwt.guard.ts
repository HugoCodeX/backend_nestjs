import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request } from 'express';
import { errors as joseErrors, jwtVerify } from 'jose';
import { JWKS } from './jwks';

export interface AuthenticatedUser {
  sub: string;
}

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtGuard implements CanActivate {
  private readonly logger = new Logger(JwtGuard.name);

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();

    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = auth.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }

    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: process.env.JWT_ISSUER!,
        audience: process.env.JWT_AUDIENCE!,
        algorithms: ['EdDSA'],
        clockTolerance: 30,
      });

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new UnauthorizedException('Token missing or invalid sub claim');
      }

      req.user = { sub: payload.sub };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      if (err instanceof joseErrors.JWTExpired) {
        throw new UnauthorizedException('Token expired');
      }
      if (err instanceof joseErrors.JWTClaimValidationFailed) {
        throw new UnauthorizedException('Token claim validation failed');
      }
      this.logger.warn(`JWT verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
