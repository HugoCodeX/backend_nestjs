import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { type Request } from 'express';
import { type AuthenticatedUser } from './jwt.guard';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user) {
      throw new InternalServerErrorException(
        'CurrentUser used on a route without JwtGuard',
      );
    }
    return req.user;
  },
);
