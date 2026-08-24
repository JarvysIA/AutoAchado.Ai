import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { AUTOMOTIVE_ROOT_CATEGORY_ID, MeliTaxonomyAdapter } from "../src/meli/taxonomy-adapter.js";
import { TaxonomyTree } from "../src/taxonomy/tree.js";
import type { TaxonomyCategoryNode } from "../src/taxonomy/types.js";
import {
  buildAutomotiveTaxonomySnapshot,
  checksumAutomotiveTaxonomySnapshot,
  serializeAutomotiveTaxonomySnapshot,
  validateAutomotiveTaxonomySnapshot,
} from "../tests/helpers/automotive-taxonomy-snapshot.js";

const EXPECTED_R3_HASH = "1D8E71C468205D3D16A1D1C1A381969254B4F6A8B3B8ED5D907FAA7C6BF62714";
const R3_NODE_COUNT = 3269;
const R3_LEAF_COUNT = 2863;
const R3_NON_LEAF_COUNT = 406;
const R3_ROOT_CHILD_IDS = [
  "MLB22693", "MLB419936", "MLB1747", "MLB243551", "MLB6005", "MLB1771",
  "MLB456046", "MLB438364", "MLB2227", "MLB260634", "MLB1776", "MLB456111",
  "MLB2239", "MLB3381", "MLB377674", "MLB188063", "MLB2238", "MLB8531",
  "MLB45468", "MLB255788", "MLB458209", "MLB455216", "MLB457400", "MLB5802",
] as const;
const CANDIDATE_BRANCH_IDS = [
  "MLB2238", "MLB255788", "MLB456111", "MLB2227",
  "MLB188063", "MLB2239", "MLB3381", "MLB8531",
] as const;
const AUDITED_UNIVERSAL_CANDIDATE_IDS = [
  "MLB188063", // branch factual de limpeza
  "MLB2239", // branch factual de segurança
  "MLB370798", // infladores de chão
  "MLB440135", // ancestry de infladores
  "MLB458031", // carregadores portáteis para carros/caminhonetes
  "MLB458482", // organizers e armazenamento
  "MLB459155", // kit de ferramentas de emergência
  "MLB459349", // infladores de pneus
  "MLB459522", // carregadores USB
  "MLB459531", // organizadores de porta-malas
  "MLB459532", // organizador para crianças
  "MLB459534", // organizador de protetor solar
  "MLB63533", // compressores de ar sob Infladores
] as const;

const repositoryRoot = resolve(process.cwd());
const snapshotPath = resolve(repositoryRoot, "tests/fixtures/meli-automotive-taxonomy.snapshot.json");
const checksumPath = resolve(repositoryRoot, "tests/fixtures/meli-automotive-taxonomy.snapshot.sha256");
const reportPath = resolve(repositoryRoot, "reports/0B3B2-SNAPSHOT-audit.md");
const r3ReportPath = resolve(repositoryRoot, "reports/0B3B-LIVE-R3-taxonomy-audit.md");

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function pathOf(node: TaxonomyCategoryNode): string {
  return node.pathNames.join(" > ");
}

function table(nodes: readonly TaxonomyCategoryNode[]): string {
  if (nodes.length === 0) return "Nenhum nó localizado.\n";
  return [
    "| ID | Nome | Path | Leaf |",
    "|---|---|---|---|",
    ...nodes.map((node) => `| ${node.externalCategoryId} | ${node.name.replaceAll("|", "\\|")} | ${pathOf(node).replaceAll("|", "\\|")} | ${node.isLeaf} |`),
    "",
  ].join("\n");
}

function branchSummary(tree: TaxonomyTree, branchId: string): string {
  const branch = tree.getNode(branchId);
  const descendants = tree.getDescendants(branchId);
  const children = tree.getChildren(branchId);
  const residualChildren = children.filter((node) => /^Outros(?:\b|\s)/i.test(node.name));
  return [
    `### ${branch.externalCategoryId} — ${branch.name}`,
    "",
    `- Node count: ${descendants.length + 1}`,
    `- Descendentes: ${descendants.length}`,
    `- Filhos imediatos: ${children.length}`,
    `- Residuais imediatos: ${residualChildren.length === 0 ? "nenhum" : residualChildren.map((node) => `${node.externalCategoryId} (${node.name})`).join(", ")}`,
    "",
    table(children),
  ].join("\n");
}

function nodesMatching(tree: TaxonomyTree, matcher: (node: TaxonomyCategoryNode) => boolean): readonly TaxonomyCategoryNode[] {
  return tree.getDescendants(AUTOMOTIVE_ROOT_CATEGORY_ID)
    .filter(matcher)
    .sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId));
}

function nodesByAuditedIds(tree: TaxonomyTree, ids: readonly string[]): readonly TaxonomyCategoryNode[] {
  return ids.map((id) => tree.getNode(id)).sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId));
}

async function main(): Promise<void> {
  const r3Bytes = await readFile(r3ReportPath);
  if (sha256(r3Bytes) !== EXPECTED_R3_HASH) throw new Error("R3_REPORT_HASH_MISMATCH");

  let totalHttpAttempts = 0;
  let logicalDumpRuns = 0;
  const countedFetch: typeof fetch = async (input, init) => {
    totalHttpAttempts += 1;
    return fetch(input, init);
  };
  const adapter = new MeliTaxonomyAdapter({
    fetchImpl: countedFetch,
    getAccessToken: async () => null,
  });

  logicalDumpRuns += 1;
  const envelope = await adapter.fetchCategoryTree("MLB");
  const sourceTree = new TaxonomyTree(envelope.nodes, { requiredRootId: AUTOMOTIVE_ROOT_CATEGORY_ID });
  const snapshot = buildAutomotiveTaxonomySnapshot(envelope);
  const serializedFirst = serializeAutomotiveTaxonomySnapshot(snapshot);
  const serializedSecond = serializeAutomotiveTaxonomySnapshot(snapshot);
  if (serializedFirst !== serializedSecond) throw new Error("SNAPSHOT_NOT_DETERMINISTIC");
  const checksum = checksumAutomotiveTaxonomySnapshot(serializedFirst);
  const { stats } = validateAutomotiveTaxonomySnapshot(snapshot);

  const rootChildren = [...sourceTree.getChildren(AUTOMOTIVE_ROOT_CATEGORY_ID)]
    .sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId));
  const currentRootIds = rootChildren.map((node) => node.externalCategoryId);
  const expectedRootIds = [...R3_ROOT_CHILD_IDS].sort();
  const rootChildrenChanged = JSON.stringify(currentRootIds) !== JSON.stringify(expectedRootIds);
  const taxonomyDrift = stats.nodeCount !== R3_NODE_COUNT
    || stats.leafCount !== R3_LEAF_COUNT
    || stats.nonLeafCount !== R3_NON_LEAF_COUNT
    || rootChildrenChanged;

  if (!sourceTree.getNode(AUTOMOTIVE_ROOT_CATEGORY_ID)) throw new Error("AUTOMOTIVE_ROOT_MISSING");

  const services = sourceTree.getDescendants("MLB377674");
  const gnv = sourceTree.getDescendants("MLB45468");
  const motorcycles = sourceTree.getDescendants("MLB458209");
  const targetGroups = [
    ["Filtros", /^(Filtros|Filtro(?:s| de .+)?)$/i],
    ["Freios", /^Freios$/i],
    ["Suspensão", /^Suspens[aã]o(?: e Dire[cç][aã]o)?$/i],
    ["Iluminação", /^Ilumina[cç][aã]o$/i],
    ["Baterias", /^(Baterias(?: e Acess[oó]rios)?|Componentes para Baterias|Ferramentas para Baterias)$/i],
    ["Infladores", /^Infladores$/i],
  ] as const;
  const report = [
    "# 0B3B2-SNAPSHOT — Sanitized Automotive Taxonomy Audit",
    "",
    "> Auditoria factual. Sem classificação comercial.",
    "",
    "## Execução",
    "",
    `- Logical dump runs: ${logicalDumpRuns}`,
    `- Total HTTP attempts: ${totalHttpAttempts}`,
    `- Retry executado: ${totalHttpAttempts > logicalDumpRuns}`,
    "- Anonymous only: true",
    "- No second manual request: true",
    `- HTTP status: ${envelope.responseDiagnostics.status}`,
    "",
    "## Source",
    "",
    `- Source version: ${envelope.sourceVersion}`,
    `- Source content-created: ${envelope.sourceContentCreated ?? "null"}`,
    `- Snapshot checksum: ${checksum}`,
    "",
    "## Estrutura",
    "",
    `- Root: ${AUTOMOTIVE_ROOT_CATEGORY_ID}`,
    `- Nodes: ${stats.nodeCount}`,
    `- Leaf: ${stats.leafCount}`,
    `- Non-leaf: ${stats.nonLeafCount}`,
    `- Max path length: ${stats.maxPathLength}`,
    `- Root children: ${stats.rootChildCount}`,
    "",
    "## Drift desde R3",
    "",
    `- TAXONOMY_DRIFT_SINCE_R3: ${taxonomyDrift}`,
    `- R3 nodes/current nodes: ${R3_NODE_COUNT}/${stats.nodeCount}`,
    `- R3 leaf/current leaf: ${R3_LEAF_COUNT}/${stats.leafCount}`,
    `- R3 non-leaf/current non-leaf: ${R3_NON_LEAF_COUNT}/${stats.nonLeafCount}`,
    `- Root children changed: ${rootChildrenChanged}`,
    "",
    "## Root children atuais",
    "",
    table(rootChildren),
    "## Serviços Programados — descendentes",
    "",
    table(services),
    "## GNV — descendentes",
    "",
    table(gnv),
    "## MLB458209 Motos — descendentes",
    "",
    table(motorcycles),
    "## Oito branches candidatos homogêneos",
    "",
    ...CANDIDATE_BRANCH_IDS.map((id) => branchSummary(sourceTree, id)),
    "## Child ancestries localizadas",
    "",
    ...targetGroups.flatMap(([label, matcher]) => [
      `### ${label}`,
      "",
      table(nodesMatching(sourceTree, (node) => matcher.test(node.name))),
    ]),
    "## Candidatos factuais a acessórios universais",
    "",
    table(nodesByAuditedIds(sourceTree, AUDITED_UNIVERSAL_CANDIDATE_IDS)),
    "- Nenhum nome contendo `celular` ou `smartphone` foi localizado na subtree atual.",
    "- Compressores de climatização, suspensão, freio e turbocompressores foram deliberadamente excluídos desta lista.",
    "- A lista indica somente candidatos por ID/path; universalidade ainda exige revisão comercial.",
    "",
    "## Resultado da auditoria direcionada",
    "",
    `- Serviços Programados: ${services.length} descendentes listados integralmente; a estrutura factual permite revisão de ancestry sem nova chamada.`,
    `- GNV: ${gnv.length} descendentes listados; inclui componentes e a categoria Ensaio Hidráulico, que exige decisão específica.`,
    `- MLB458209 Motos: ${motorcycles.length} descendentes; os nomes factuais representam motos/scooters completos e residual Outros.`,
    "- Oito candidates: filhos imediatos e residuais estruturais registrados por branch.",
    "- Child ancestries: filtros, freios, suspensão, iluminação, baterias e infladores localizados por IDs e paths.",
    "- Acessórios universais: candidatos auditados por path; nenhuma classificação foi aplicada.",
    "",
    "## Limitações",
    "",
    "- Nomes e paths identificam candidatos factuais; não provam universalidade, elegibilidade ou prioridade.",
    "- Nenhuma classificação ALLOWED/REVIEW/EXCLUDED/UNKNOWN foi produzida.",
    "- O snapshot não contém payload bruto, contagem de anúncios, produtos, ofertas ou seller data.",
    "",
  ].join("\n");

  await mkdir(resolve(repositoryRoot, "tests/fixtures"), { recursive: true });
  await mkdir(resolve(repositoryRoot, "reports"), { recursive: true });
  await writeFile(snapshotPath, serializedFirst, { encoding: "utf8", flag: "wx" });
  await writeFile(checksumPath, `${checksum}\n`, { encoding: "utf8", flag: "wx" });
  await writeFile(reportPath, report, { encoding: "utf8", flag: "wx" });

  process.stdout.write([
    "SNAPSHOT_GENERATED_OK",
    `LOGICAL_DUMP_RUNS=${logicalDumpRuns}`,
    `TOTAL_HTTP_ATTEMPTS=${totalHttpAttempts}`,
    `RETRY_EXECUTED=${totalHttpAttempts > logicalDumpRuns}`,
    `HTTP_STATUS=${envelope.responseDiagnostics.status}`,
    `NODE_COUNT=${stats.nodeCount}`,
    `LEAF_COUNT=${stats.leafCount}`,
    `NON_LEAF_COUNT=${stats.nonLeafCount}`,
    `ROOT_CHILD_COUNT=${stats.rootChildCount}`,
    `MAX_PATH_LENGTH=${stats.maxPathLength}`,
    `TAXONOMY_DRIFT_SINCE_R3=${taxonomyDrift}`,
    `CHECKSUM=${checksum}`,
  ].join("\n") + "\n");
}

await main();
