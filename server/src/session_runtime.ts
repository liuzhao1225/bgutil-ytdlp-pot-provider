import { Worker } from "node:worker_threads";
import type { SessionManager } from "./session_manager.ts";

// One ordered stream prevents a reset from racing an in-flight token mint.
// The worker owns all BotGuard globals, DOMs, listeners and token caches.
export class SessionRuntime {
    private worker?: Worker;
    private tail: Promise<unknown> = Promise.resolve();
    private failure?: Error;
    private pending?: {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
    };
    constructor(
        private workerUrl = new URL("./session_worker.js", import.meta.url),
    ) {}

    private ordered<T>(action: () => Promise<T>): Promise<T> {
        const result = this.tail.then(action);
        // Keep subsequent operations schedulable; the caller receives the original rejection.
        this.tail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    private async start(): Promise<void> {
        if (this.failure) throw this.failure;
        if (this.worker) return;
        const worker = new Worker(this.workerUrl);
        this.worker = worker;
        await new Promise<void>((resolve, reject) => {
            const fail = (error: Error) => {
                this.failure ??= error;
                reject(this.failure);
                this.pending?.reject(this.failure);
                this.pending = undefined;
            };
            worker.on("error", fail);
            worker.on("exit", (code) => {
                if (this.worker === worker)
                    fail(new Error(`Token runtime exited with code ${code}`));
            });
            worker.on("message", (message) => {
                if (message.ready) {
                    resolve();
                    return;
                }
                const pending = this.pending;
                this.pending = undefined;
                if (message.error) {
                    const error = new Error(message.error.message);
                    error.stack = message.error.stack;
                    pending?.reject(error);
                } else pending?.resolve(message.value);
            });
        });
    }

    private call(method: string, args: unknown[] = []): Promise<any> {
        return this.ordered(async () => {
            await this.start();
            return new Promise((resolve, reject) => {
                this.pending = { resolve, reject };
                try {
                    this.worker!.postMessage({ method, args });
                } catch (error) {
                    this.pending = undefined;
                    reject(error);
                }
            });
        });
    }

    generatePoToken(...args: Parameters<SessionManager["generatePoToken"]>) {
        return this.call("generatePoToken", args);
    }
    invalidateIT() {
        return this.call("invalidateIT");
    }
    minterCacheKeys() {
        return this.call("minterCacheKeys");
    }
    invalidateCaches(): Promise<void> {
        return this.ordered(async () => {
            await this.stop();
            this.failure = undefined;
            await this.start();
            console.info("Token runtime rebuilt; all signing state discarded");
        });
    }
    private async stop(): Promise<void> {
        const worker = this.worker;
        this.worker = undefined;
        if (worker) await worker.terminate();
    }
    close() {
        return this.ordered(() => this.stop());
    }
}
