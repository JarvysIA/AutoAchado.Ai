import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseMeliCategoryTree } from "../../src/taxonomy/parser.js";
import type { TaxonomyTreeEnvelope } from "../../src/taxonomy/types.js";
import { validAutomotiveDump } from "../fixtures/meli-taxonomy.js";
import {
  AUTOMOTIVE_SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_FORBIDDEN_FIELDS,
  buildAutomotiveTaxonomySnapshot,
  checksumAutomotiveTaxonomySnapshot,
  serializeAutomotiveTaxonomySnapshot,
  snapshotToTaxonomyTree,
  validateAutomotiveTaxonomySnapshot,
} from "../helpers/automotive-taxonomy-snapshot.js";

const snapshotUrl = new URL("../fixtures/meli-automotive-taxonomy.snapshot.json", import.meta.url);
const checksumUrl = new URL("../fixtures/meli-automotive-taxonomy.snapshot.sha256", import.meta.url);

function syntheticEnvelope(): TaxonomyTreeEnvelope {
  return {
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    sourceVersion: `sha256:${"a".repeat(64)}`,
    sourceContentCreated: "2026-08-21T12:00:00Z",
    sourceContentMd5: null,
    internalChecksum: "a".repeat(64),
    fetchedAt: "2099-01-01T00:00:00.000Z",
    nodes: parseMeliCategoryTree(validAutomotiveDump(), "MLB"),
    responseDiagnostics: {
      status: 200,
      operation: "FETCH_CATEGORY_TREE",
      contentType: "application/json",
      contentEncoding: null,
      contentLength: null,
      transportBytes: null,
      processedBytes: null,
      bodyHadGzipMagic: null,
      topLevelKind: "ARRAY",
      topLevelArrayLength: 1,
      topLevelObjectKeyCount: null,
    },
  };
}

describe("snapshot sanitizado da taxonomia automotiva", () => {
  it("gera somente a subtree normalizada e ignora metadata temporal", () => {
    const first = buildAutomotiveTaxonomySnapshot(syntheticEnvelope());
    const secondEnvelope = { ...syntheticEnvelope(), fetchedAt: "2100-01-01T00:00:00.000Z" };
    const second = buildAutomotiveTaxonomySnapshot(secondEnvelope);
    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe(AUTOMOTIVE_SNAPSHOT_SCHEMA_VERSION);
    expect(first.nodes).toHaveLength(4);
    expect(JSON.stringify(first)).not.toContain("fetchedAt");
  });

  it("serializa deterministicamente com field order fixo e newline final", () => {
    const snapshot = buildAutomotiveTaxonomySnapshot(syntheticEnvelope());
    const serialized = serializeAutomotiveTaxonomySnapshot(snapshot);
    expect(serialized).toBe(serializeAutomotiveTaxonomySnapshot(snapshot));
    expect(serialized.endsWith("\n")).toBe(true);
    expect(Object.keys(JSON.parse(serialized))).toEqual([
      "schemaVersion", "marketplaceKey", "siteId", "rootCategoryId",
      "sourceVersion", "sourceContentCreated", "nodeCount", "nodes",
    ]);
  });

  it("valida checksum, estrutura, ordem, paths, parents e leaf flags do fixture real", async () => {
    const serialized = await readFile(snapshotUrl, "utf8");
    const expectedChecksum = (await readFile(checksumUrl, "utf8")).trim();
    const actualChecksum = createHash("sha256").update(serialized, "utf8").digest("hex");
    expect(actualChecksum).toBe(expectedChecksum);
    expect(checksumAutomotiveTaxonomySnapshot(serialized)).toBe(expectedChecksum);

    const { snapshot, stats } = validateAutomotiveTaxonomySnapshot(JSON.parse(serialized));
    expect(snapshot.nodeCount).toBe(snapshot.nodes.length);
    expect(stats.nodeCount).toBeGreaterThan(0);
    expect(stats.rootChildCount).toBeGreaterThan(0);
    expect(snapshotToTaxonomyTree(snapshot).getDescendants("MLB5672")).toHaveLength(snapshot.nodeCount - 1);
    expect(serializeAutomotiveTaxonomySnapshot(snapshot)).toBe(serialized);
  });

  it("não contém campos proibidos nem campos extras", async () => {
    const parsed = JSON.parse(await readFile(snapshotUrl, "utf8")) as Record<string, unknown>;
    const serialized = JSON.stringify(parsed);
    for (const field of SNAPSHOT_FORBIDDEN_FIELDS) {
      expect(serialized).not.toContain(`\"${field}\"`);
    }
    const nodes = parsed.nodes as Array<Record<string, unknown>>;
    expect(Object.keys(nodes[0]!)).toEqual([
      "externalCategoryId", "name", "parentExternalCategoryId",
      "pathExternalCategoryIds", "pathNames", "isLeaf",
    ]);
  });

  it("rejeita IDs duplicados, parent ausente, ordem inválida e leaf divergente", () => {
    const base = buildAutomotiveTaxonomySnapshot(syntheticEnvelope());
    const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(base)) as Record<string, unknown>;

    const duplicate = clone();
    (duplicate.nodes as unknown[]).push((duplicate.nodes as unknown[])[0]);
    duplicate.nodeCount = (duplicate.nodeCount as number) + 1;
    expect(() => validateAutomotiveTaxonomySnapshot(duplicate)).toThrow(/DUPLICATE_ID|NODE_ORDER/);

    const missingParent = clone();
    (missingParent.nodes as Array<Record<string, unknown>>)[1]!.parentExternalCategoryId = "MLB999999999";
    expect(() => validateAutomotiveTaxonomySnapshot(missingParent)).toThrow(/PARENT_MISSING|PATH_PARENT_MISMATCH/);

    const unordered = clone();
    (unordered.nodes as unknown[]).reverse();
    expect(() => validateAutomotiveTaxonomySnapshot(unordered)).toThrow(/NODE_ORDER/);

    const wrongLeaf = clone();
    (wrongLeaf.nodes as Array<Record<string, unknown>>)[0]!.isLeaf = true;
    expect(() => validateAutomotiveTaxonomySnapshot(wrongLeaf)).toThrow(/ROOT_SHAPE|LEAF_MISMATCH/);
  });
});
