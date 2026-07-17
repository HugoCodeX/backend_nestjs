import { All, Controller, Logger, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import { AxiosError, type AxiosResponse } from 'axios';
import { stripUnsafeHeaders } from './strip-headers';
import { getJwtFromSession } from './get-jwt';
import { http, shutdownHttp } from './http';
import { destroyJwtCache } from './get-jwt';

const PROPAGATE_RESPONSE_HEADERS = new Set([
  'cache-control',
  'etag',
  'vary',
  'last-modified',
  'x-request-id',
]);

@Controller()
@UseGuards(ThrottlerGuard)
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);

  // 'api/auth{/*path}' matchea /api/auth, /api/auth/sign-in/email, /api/auth/jwks, etc.
  // Rate limiting por endpoint lo hace Better Auth internamente (rateLimit config).
  // El ThrottlerGuard del gateway es solo DDoS protection general.
  @All('api/auth{/*path}')
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    return this.proxyRaw(req, res, process.env.AUTH_SERVICE_URL!, {
      forwardCookie: true,
      addBearer: false,
    });
  }

  // 'api/profile{/*path}' matchea /api/profile, /api/profile/me, etc.
  @All('api/profile{/*path}')
  async proxyProfile(@Req() req: Request, @Res() res: Response) {
    return this.proxyRaw(req, res, process.env.PROFILE_SERVICE_URL!, {
      forwardCookie: false,
      addBearer: true,
    });
  }

  // Health check (sin throttling, sin proxy).
  @All('health{/*path}')
  health(@Res() res: Response) {
    res.status(200).json({ status: 'ok' });
  }

  onApplicationShutdown(): void {
    shutdownHttp();
    destroyJwtCache();
  }

  private async proxyRaw(
    req: Request,
    res: Response,
    upstreamBaseUrl: string,
    opts: { forwardCookie: boolean; addBearer: boolean },
  ) {
    const start = Date.now();

    if (
      !req.url.startsWith('/api/auth') &&
      !req.url.startsWith('/api/profile')
    ) {
      res.status(404).json({ message: 'Not Found' });
      return;
    }

    let bearer: string | undefined;

    if (opts.addBearer) {
      const jwt = await getJwtFromSession(req.headers.cookie);
      if (!jwt.ok) {
        res.status(jwt.status).json({ message: jwt.error });
        return;
      }
      bearer = jwt.token;
    }

    const safeHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(
      stripUnsafeHeaders(req.headers as Record<string, unknown>),
    )) {
      if (typeof value === 'string') {
        safeHeaders[key] = value;
      } else if (Array.isArray(value)) {
        safeHeaders[key] = value.map((v) => String(v));
      }
    }

    if (opts.forwardCookie && req.headers.cookie) {
      safeHeaders['cookie'] = req.headers.cookie;
    }

    if (bearer) {
      safeHeaders['authorization'] = `Bearer ${bearer}`;
    }

    if (!safeHeaders['origin']) {
      safeHeaders['origin'] = process.env.BETTER_AUTH_URL!;
    }

    if (req.ip) {
      safeHeaders['x-forwarded-for'] = req.ip;
      safeHeaders['x-real-ip'] = req.ip;
    }

    const upstreamUrl = `${upstreamBaseUrl}${req.originalUrl}`;
    this.logger.debug(`→ ${req.method} ${upstreamUrl}`);

    try {
      const upstream: AxiosResponse<Buffer> = await http.request({
        method: req.method,
        url: upstreamUrl,
        data: this.extractBody(req),
        headers: safeHeaders,
      });

      this.logger.debug(
        `← ${upstream.status} (${upstream.data.length} bytes) in ${Date.now() - start}ms`,
      );

      res.status(upstream.status);

      const setCookies = upstream.headers['set-cookie'];
      if (setCookies) {
        const list = Array.isArray(setCookies) ? setCookies : [setCookies];
        for (const cookie of list) {
          res.append('Set-Cookie', cookie);
        }
      }

      const location: unknown = upstream.headers['location'];
      if (typeof location === 'string') {
        res.setHeader('Location', location);
      }

      const contentType: unknown = upstream.headers['content-type'];
      if (typeof contentType === 'string') {
        res.setHeader('Content-Type', contentType);
      }

      for (const [name, value] of Object.entries(upstream.headers)) {
        if (PROPAGATE_RESPONSE_HEADERS.has(name.toLowerCase())) {
          res.setHeader(name, String(value));
        }
      }

      res.send(upstream.data);
    } catch (err) {
      const axiosError = err as AxiosError;
      const status = axiosError.response?.status ?? 502;
      this.logger.error(
        `ERROR proxying to ${upstreamUrl} (${status}) in ${Date.now() - start}ms: ${(err as Error).message}`,
      );
      const responseData: unknown = axiosError.response?.data;
      if (responseData) {
        if (Buffer.isBuffer(responseData) && responseData.length < 4096) {
          res.status(status).send(responseData);
        } else {
          res.status(status).json({ message: 'Upstream error' });
        }
      } else {
        res.status(status).json({ message: 'Gateway error' });
      }
    }
  }

  private extractBody(req: Request): Buffer | undefined {
    if (
      req.method === 'GET' ||
      req.method === 'HEAD' ||
      req.method === 'DELETE'
    ) {
      return undefined;
    }
    const body: unknown = req.body;
    if (Buffer.isBuffer(body)) return body;
    if (typeof body === 'string') return Buffer.from(body);
    if (body && typeof body === 'object' && Object.keys(body).length > 0) {
      return Buffer.from(JSON.stringify(body));
    }
    return undefined;
  }
}
