import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Client, type ClientGrpc, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { Observable, firstValueFrom } from 'rxjs';
import { CircuitBreaker } from '../common/circuit-breaker';

interface AuthGrpcService {
  validateToken(data: { token: string }): Observable<{
    valid: boolean;
    userId: string;
    email: string;
    error: string;
  }>;
}

@Injectable()
export class AuthClient implements OnModuleInit {
  @Client({
    transport: Transport.GRPC,
    options: {
      package: 'auth',
      protoPath: join(process.cwd(), '../../libs/shared/src/proto/auth.proto'),
      url: process.env.AUTH_SERVICE_GRPC_URL ?? 'localhost:5001',
    },
  })
  private client!: ClientGrpc;

  private authService!: AuthGrpcService;

  // circuit breaker shared across all calls from this client
  private breaker = new CircuitBreaker(5, 30000);

  onModuleInit() {
    // getService() maps the proto methods to TypeScript methods
    this.authService = this.client.getService<AuthGrpcService>('AuthService');
  }

  async validateToken(token: string) {
    const result = await this.breaker.execute(() =>
      firstValueFrom(this.authService.validateToken({ token })),
    );

    if (!result.valid) throw new UnauthorizedException(result.error);
    return result;
  }
}
