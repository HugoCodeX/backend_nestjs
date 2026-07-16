import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthClient } from '../../clients/auth.client';

export interface GrpcAuthenticatedUser {
  valid: boolean;
  userId: string;
  email: string;
  error: string;
}

export interface RequestWithUser extends Request {
  user: GrpcAuthenticatedUser;
}

@Injectable()
export class GrpcAuthGuard implements CanActivate {
  constructor(private authClient: AuthClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const authHeader = request.headers['authorization'];
    if (!authHeader) throw new UnauthorizedException('No token provided');

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token)
      throw new UnauthorizedException('Invalid token format');

    // validate token via gRPC call to auth-service
    // authClient.validateToken throws UnauthorizedException if invalid
    const user = await this.authClient.validateToken(token);

    // attach validated user info to request so controllers can access it
    request.user = user;
    return true;
  }
}
