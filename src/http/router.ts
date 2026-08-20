import type { IncomingMessage } from "node:http";

export function requestUrl(request: IncomingMessage): URL {
  const url = new URL(request.url ?? "/", "https://autoachado-ai.vercel.app");
  const rewrittenRoute = url.searchParams.get("route");
  if (rewrittenRoute !== null) {
    url.pathname = rewrittenRoute ? `/${rewrittenRoute.replace(/^\/+/, "")}` : "/";
    url.searchParams.delete("route");
  }
  return url;
}
