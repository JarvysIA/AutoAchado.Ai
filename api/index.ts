import type { IncomingMessage, ServerResponse } from "node:http";
import { handleRequest } from "../src/app";

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await handleRequest(request, response);
}
