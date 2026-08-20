import type { ServerResponse } from "node:http";

export function sendHtml(response: ServerResponse, status: number, body: string, headers: Record<string, string | string[]> = {}): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://auth.mercadolivre.com.br",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

export function redirect(response: ServerResponse, location: string, cookies: string[] = []): void {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...(cookies.length > 0 ? { "Set-Cookie": cookies } : {}),
  });
  response.end();
}
