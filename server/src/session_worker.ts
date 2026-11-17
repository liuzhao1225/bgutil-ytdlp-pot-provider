import { parentPort } from "node:worker_threads";
import { strerror } from "./utils.ts";
import { SessionManager } from "./session_manager.ts";
const manager = new SessionManager();
parentPort!.on("message", async ({ method, args }) => {
    try {
        let value: unknown;
        switch (method) {
            case "minterCacheKeys":
                value = Array.from(manager.minterCache.keys());
                break;
            case "invalidateIT":
                value = manager.invalidateIT();
                break;
            case "generatePoToken":
                value = await manager.generatePoToken(
                    ...(args as Parameters<SessionManager["generatePoToken"]>),
                );
                break;
            default:
                throw new Error(`Unknown token runtime operation: ${method}`);
        }
        parentPort!.postMessage({ value });
    } catch (error) {
        parentPort!.postMessage({
            error: { message: strerror(error), stack: error.stack },
        });
    }
});
parentPort!.postMessage({ ready: true });
