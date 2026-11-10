// Worker entry: /api/* goes to the API router; everything else is served from public/ as static assets.
import { onRequest } from '../functions/api/[[path]]';
import type { Env } from '../server/core';

export default {
  async fetch(request: Request, env: Env & { ASSETS: Fetcher }, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return (onRequest as any)({ request, env, waitUntil: ctx.waitUntil.bind(ctx), params: {}, data: {}, next: () => env.ASSETS.fetch(request), functionPath: url.pathname });
    }
    return env.ASSETS.fetch(request);
  },
};
