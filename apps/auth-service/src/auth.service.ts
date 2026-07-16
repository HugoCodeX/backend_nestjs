import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from 'src/db';
import { users } from 'src/db/schema';
import { RegisterDto } from 'src/dto/register.dto';
import { LoginDto } from 'src/dto/login.dto';
import { AuthenticatedUser } from 'src/decorators/current-user.decorator';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async register(dto: RegisterDto) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, dto.email));

    if (existing) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const [user] = await db
      .insert(users)
      .values({ email: dto.email, password: hashedPassword })
      .returning();

    return {
      user: this.sanitize(user),
      token: this.generateToken(user),
    };
  }

  async login(dto: LoginDto) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, dto.email));

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const match = await bcrypt.compare(dto.password, user.password);

    if (!match) throw new UnauthorizedException('Invalid credentials');

    return {
      user: this.sanitize(user),
      token: this.generateToken(user),
    };
  }

  private generateToken(user: typeof users.$inferSelect) {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });
  }

  async validateToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(
        token,
        {
          secret: process.env.JWT_SECRET!,
        },
      );
      return {
        valid: true,
        userId: payload.sub,
        email: payload.email,
        error: '',
      };
    } catch {
      return {
        valid: false,
        userId: '',
        email: '',
        error: 'Invalid or expired token',
      };
    }
  }

  private sanitize(user: typeof users.$inferSelect) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safe } = user;
    return safe;
  }
}
