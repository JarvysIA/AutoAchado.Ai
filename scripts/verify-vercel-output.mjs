import { existsSync, readFileSync, readdirSync } from "node:fs";

const fail = (message) => {
  throw new Error(`Artefato Vercel inválido: ${message}`);
};

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const apiEntrypoints = readdirSync("api", { recursive: true })
  .map(String)
  .filter((path) => /\.(?:js|mjs|cjs|ts|mts|cts)$/.test(path.replaceAll("\\", "/")));
const artifact = readFileSync("api/index.js", "utf8");

if (config.framework !== null) fail("framework deve ser null");
if ("builds" in config) fail("configuração legacy builds não é permitida");
if ("functions" in config) {
  const functions = config.functions;
  if (!functions || typeof functions !== "object" || Array.isArray(functions)) {
    fail("functions deve ser um objeto válido quando presente");
  }
  const entries = Object.entries(functions);
  if (entries.length === 0) fail("functions não pode ser um objeto vazio");
  for (const [path, options] of entries) {
    if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).length === 0) {
      fail(`configuração de Function vazia ou inválida: ${path}`);
    }
  }
}
if (apiEntrypoints.length !== 1 || apiEntrypoints[0] !== "index.js") {
  fail(`entrypoints inesperados em api/: ${apiEntrypoints.join(", ")}`);
}
if (!/export\s*\{[\s\S]*\bas default\b[\s\S]*\}/.test(artifact)) {
  fail("api/index.js não possui export default");
}
if (existsSync("src/app.js") || existsSync("dist/src/app.js")) {
  fail("src/app.js foi emitido como artefato intermediário");
}
if (/(?:from\s+|import\s*\()["']\.{1,2}\//.test(artifact)) {
  fail("api/index.js contém import relativo de runtime");
}

process.stdout.write("VERCEL_OUTPUT_ISOLATED_OK\n");
