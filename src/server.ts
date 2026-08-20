import { createServer } from "node:http";
import { handleRequest } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Falha interna sanitizada");
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`AutoAchado API Probe disponível em http://127.0.0.1:${port}\n`);
});
