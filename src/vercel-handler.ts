import type { IncomingMessage, ServerResponse } from "node:http";
import { handleRequest } from "./app.js";

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await handleRequest(request, response);
}
export { runConfiguredDiscoveryLiveSmoke } from "./server/discovery/operational.js";
