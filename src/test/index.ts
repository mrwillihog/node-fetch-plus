import { Response } from 'node-fetch';

export function mockResponse(status: number, body?: any) {
  return new Response(body, {
    status,
  });
}
