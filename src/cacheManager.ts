import CachePolicy from 'http-cache-semantics';
import { Headers, Request, Response } from 'node-fetch';

interface CacheableResponse {
  url: string;
  status: number;
  statusText: string;
  body: string;
  headers: { [key: string]: string[] };
}

export interface CacheClient {
  get: (key: string) => Promise<any>;
  set: (key: string, value: {}, ttl: number) => Promise<any>;
}

export class CacheManager {
  private readonly cache: CacheClient;

  constructor(cache: CacheClient) {
    this.cache = cache;
  }

  public async get(request: Request): Promise<Response | undefined> {
    const key = this.createCacheKey(request);
    const res: { policy: any; response: CacheableResponse } = await this.cache.get(key);
    if (res) {
      const policy = CachePolicy.fromObject(res.policy);
      const response = res.response;

      if (policy && policy.satisfiesWithoutRevalidation(request)) {
        return new Response(response.body, {
          headers: new Headers(policy.responseHeaders()),
          status: response.status,
          statusText: response.statusText,
          url: response.url,
        } as any);
      }
    }
  }

  public async set(request: Request, response: Response): Promise<void> {
    const policy = this.createPolicy(request, response);

    if (policy.storable()) {
      const key = this.createCacheKey(request);
      const body = await response.clone().text();

      const cacheableResponse: CacheableResponse = {
        body,
        headers: response.headers.raw(),
        status: response.status,
        statusText: response.statusText,
        url: response.url,
      };

      await this.cache.set(key, { policy: policy.toObject(), response: cacheableResponse }, policy.timeToLive());
    }
  }

  private createPolicy(request: Request, response: Response): CachePolicy {
    const formattedRequest = {
      headers: mapFetchHeadersToObject(request.headers),
      method: request.method,
      url: request.url,
    };

    const formattedResponse = {
      headers: mapFetchHeadersToObject(response.headers),
      status: response.status,
    };

    return new CachePolicy(formattedRequest, formattedResponse, {
      shared: false,
    });
  }

  private createCacheKey(request: Request): string {
    return `node-fetch-plus:${request.url.toLowerCase()}`;
  }
}

function mapFetchHeadersToObject(headers: Headers): { [key: string]: string } {
  const result: { [key: string]: string } = {};
  for (const [header, value] of headers) {
    result[header] = value;
  }
  return result;
}
