import { createServer } from "node:http";
import { handleRequest } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const server = createServer((request, response) => {
  void handleRequest(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Falha interna sanitizada");
  });
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`AutoAchado API Probe disponível em http://0.0.0.0:${port}\n`);
});
