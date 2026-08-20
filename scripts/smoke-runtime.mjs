const moduleUrl = new URL("../dist/api/index.js", import.meta.url);
const loaded = await import(moduleUrl.href);

if (typeof loaded.default !== "function") {
  throw new Error("O artefato da função Vercel não exporta um handler default");
}

process.stdout.write("RUNTIME_ESM_LOAD_OK\n");
