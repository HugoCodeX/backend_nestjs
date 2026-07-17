import { Agent } from 'http';
import { Agent as HttpsAgent } from 'https';
import axios, { type AxiosInstance } from 'axios';

const httpAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 60_000,
  maxSockets: 128,
  maxFreeSockets: 32,
  timeout: 5_000,
});

const httpsAgent = new HttpsAgent({
  keepAlive: true,
  keepAliveMsecs: 60_000,
  maxSockets: 128,
  maxFreeSockets: 32,
  timeout: 5_000,
});

export const http: AxiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 10_000,
  validateStatus: () => true,
  maxRedirects: 0,
  responseType: 'arraybuffer',
  decompress: false,
  transitional: {
    forcedJSONParsing: false,
  },
});

export function shutdownHttp(): void {
  httpAgent.destroy();
  httpsAgent.destroy();
}
