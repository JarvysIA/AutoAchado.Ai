import { createServer } from "node:http";
import handler from "../api/index.js";

const server = createServer((request, response) => {
  void handler(request, response);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Endereço HTTP local indisponível");
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  const body = await response.text();
  if (response.status !== 200) throw new Error(`HTTP inesperado: ${response.status}`);
  if (!body.includes("AutoAchado.AI")) throw new Error("Título ausente no artefato Vercel");
  if (!body.includes("Conectar Mercado Livre")) throw new Error("Botão OAuth ausente no artefato Vercel");
  if (body.includes("ERR_MODULE_NOT_FOUND")) throw new Error("Falha de módulo presente na resposta");
  process.stdout.write("HTTP_VERCEL_ARTIFACT_OK\n");
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
