// The one piece of Node the Worker uses (with the nodejs_compat flag): AsyncLocalStorage, for the AI meter (meter.ts).
declare module 'node:async_hooks' {
  export class AsyncLocalStorage<T> {
    run<R>(store: T, fn: () => R): R;
    getStore(): T | undefined;
  }
}
