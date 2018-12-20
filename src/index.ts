import { EventEmitter } from 'events';
import fetch, { Request, RequestInit, Response } from 'node-fetch';
import pRetry from 'p-retry';
import { CacheClient, CacheManager } from './cacheManager';

interface Options {
  retry?: PartialRetryOptions | false;
  cache?: CacheClient;
}

interface RetryOptions {
  retries: number;
  factor: number;
  minTimeout: number;
  maxTimeout: number;
  retryOnStatusCodes: number[];
}
type PartialRetryOptions = Partial<RetryOptions>;

const DEFAULT_RETRYING_OPTIONS: RetryOptions = {
  factor: 2,
  maxTimeout: Number.POSITIVE_INFINITY,
  minTimeout: 1000,
  retries: 2,
  retryOnStatusCodes: [408, 500, 502, 503, 504],
};

const NON_RETRYING_OPTIONS: RetryOptions = Object.assign({}, DEFAULT_RETRYING_OPTIONS, {
  retries: 0,
});

function calculateDuration(startTime: [number, number]): number {
  const [seconds, nanoseconds] = process.hrtime(startTime);
  return seconds * 1000 + nanoseconds / 1000000;
}

interface BaseEvent {
  attempt: number;
  maxAttempts: number;
  method: string;
  url: string;
}

interface ErrorEvent extends BaseEvent {
  message: string;
  responseTime: number;
}

interface ResponseEvent extends BaseEvent {
  responseTime: number;
  statusCode: number;
}

declare interface NodeFetchPlus {
  on(event: 'error', listener: (value: ErrorEvent) => void): this;
  on(event: 'request', listener: (value: BaseEvent) => void): this;
  on(event: 'response', listener: (value: ResponseEvent) => void): this;
}

class NodeFetchPlus extends EventEmitter {
  private readonly retryOptions: RetryOptions;
  private readonly cacheManager?: CacheManager;

  constructor(opts: Options = {}) {
    super();
    if (opts.cache) {
      this.cacheManager = new CacheManager(opts.cache);
    }

    if (!opts.retry) {
      this.retryOptions = NON_RETRYING_OPTIONS;
    } else {
      this.retryOptions = Object.assign({}, DEFAULT_RETRYING_OPTIONS, opts.retry);
    }

    /**
     * If an EventEmitter emits an 'error' event with no bound listeners it will
     * quit the node process. As these events are optional for our users we dont
     * want this behaviour. So when we create a client we bind a no-op to the
     * error event to prevent this.
     */
    this.on('error', () => {}); // tslint:disable-line no-empty
  }

  public fetch(url: string | Request, init?: RequestInit): Promise<Response> {
    const request = new Request(url, init);

    const eventParams = {
      maxAttempts: this.retryOptions.retries + 1,
      method: request.method,
      url: request.url,
    };

    return pRetry(async (attempt) => {
      const startTime = process.hrtime();
      this.emit('request', {
        attempt,
        ...eventParams,
      });

      let response;
      try {
        if (this.cacheManager) {
          response = await this.cacheManager.get(request);
        }
        if (!response) {
          response = await fetch(request, init);
          if (this.cacheManager) {
            await this.cacheManager.set(request, response);
          }
        }
      } catch (err) {
        this.emit('error', {
          attempt,
          message: err.message,
          responseTime: calculateDuration(startTime),
          ...eventParams,
        });

        throw err;
      }

      this.emit('response', {
        attempt,
        responseTime: calculateDuration(startTime),
        statusCode: response.status,
        ...eventParams,
      });

      if (this.shouldRetry(attempt, response.status)) {
        throw new Error(`Received ${response.status}, retrying`);
      }

      return response;
    }, this.retryOptions);
  }

  private shouldRetry(attempt: number, status: number) {
    return attempt <= this.retryOptions.retries && this.retryOptions.retryOnStatusCodes.includes(status);
  }
}

export = NodeFetchPlus;
