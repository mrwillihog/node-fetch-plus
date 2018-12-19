import { EventEmitter } from 'events';
import fetch, { Request, RequestInit, Response } from 'node-fetch';
import pRetry from 'p-retry';

interface Options {
  retries?: PartialRetryOptions | false;
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

function extractMethod(url: string | Request, init?: RequestInit) {
  if (url instanceof Request) {
    return url.method.toUpperCase();
  } else if (init && init.method) {
    return init.method.toUpperCase();
  } else {
    return 'GET';
  }
}

function calculateDuration(startTime: [number, number]): number {
  const [seconds, nanoseconds] = process.hrtime(startTime);
  return seconds * 1000 + nanoseconds / 1000000;
}

interface BaseEvent {
  attempts: number;
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
  private retryOptions: RetryOptions;

  constructor(opts: Options = {}) {
    super();

    if (!opts.retries) {
      this.retryOptions = NON_RETRYING_OPTIONS;
    } else {
      this.retryOptions = Object.assign({}, DEFAULT_RETRYING_OPTIONS, opts.retries);
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
    const eventParams = {
      maxAttempts: this.retryOptions.retries + 1,
      method: extractMethod(url, init),
      url: url instanceof Request ? url.url : url,
    };

    return pRetry(async (attempt) => {
      const startTime = process.hrtime();
      this.emit('request', {
        attempt,
        ...eventParams,
      });

      let res;
      try {
        res = await fetch(url, init);
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
        statusCode: res.status,
        ...eventParams,
      });

      if (this.shouldRetry(attempt, res.status)) {
        throw new Error(`Received ${res.status}, retrying`);
      }
      return res;
    }, this.retryOptions);
  }

  private shouldRetry(attempt: number, status: number) {
    return attempt <= this.retryOptions.retries && this.retryOptions.retryOnStatusCodes.includes(status);
  }
}

export = NodeFetchPlus;
