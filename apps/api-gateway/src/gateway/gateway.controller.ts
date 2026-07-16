import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import axios, { AxiosError } from 'axios';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
@UseGuards(ThrottlerGuard) // rate limiting on every route
export class GatewayController {
  // register and login are public — no token needed
  @All('api/auth/register')
  @Public()
  proxyRegister(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, process.env.AUTH_SERVICE_URL!);
  }

  @All('api/auth/login')
  @Public()
  proxyLogin(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, process.env.AUTH_SERVICE_URL!);
  }

  // all other auth routes require a valid token
  @All('api/auth/*')
  @UseGuards(JwtGuard)
  proxyAuth(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, process.env.AUTH_SERVICE_URL!);
  }

  // all profile routes require a valid token
  @All('api/profile/*')
  @UseGuards(JwtGuard)
  proxyProfile(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, process.env.PROFILE_SERVICE_URL!);
  }

  private async proxy(req: Request, res: Response, serviceUrl: string) {
    try {
      const url = `${serviceUrl}${req.originalUrl}`;
      const response = await axios({
        method: req.method,
        url,
        data: req.body as unknown,
        headers: {
          ...req.headers,
          host: undefined, // strip host header to avoid conflicts with downstream services
        },
      });
      res.status(response.status).json(response.data);
    } catch (err: any) {
      const axiosError = err as AxiosError<{ message: string }>;
      const status = axiosError.response?.status ?? 500;
      const data = axiosError.response?.data ?? { message: 'Gateway error' };
      res.status(status).json(data);
    }
  }
}
