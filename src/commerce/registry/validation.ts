import type { CategoryScope, RegistryCategoryPriorityTier } from "../../persistence/contracts.js";
import type { TaxonomyCategoryNode } from "../../taxonomy/types.js";
import { registrySyncError } from "./errors.js";
import type {
  CommerceRegistrySyncContext,
  CurrentVerticalCategoryMapping,
  RegistryClassifierOutput,
} from "./types.js";

const VALID_SCOPES = new Set<CategoryScope>(["ALLOWED", "REVIEW", "EXCLUDED", "UNKNOWN"]);
const VALID_TIERS = new Set<RegistryCategoryPriorityTier>(["A", "B", "C"]);

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function validateRegistrySyncContext(context: CommerceRegistrySyncContext): void {
  const required = [
    context.marketplaceKey,
    context.siteId,
    context.verticalKey,
    context.rootExternalCategoryId,
    context.sourceVersion,
    context.expectedClassificationVersion,
    context.configVersion,
    context.checkedAt,
  ];
  if (required.some((value) => !nonEmpty(value))) {
    throw registrySyncError("REGISTRY_INVALID_CONTEXT", "Contexto do sync incompleto");
  }
}

export function validateRegistryTaxonomyUniverse(
  nodes: readonly TaxonomyCategoryNode[],
  context: CommerceRegistrySyncContext,
): void {
  if (nodes.length === 0) throw registrySyncError("REGISTRY_INVALID_TREE", "Universo de taxonomia vazio");
  const byId = new Map<string, TaxonomyCategoryNode>();
  for (const node of nodes) {
    if (byId.has(node.externalCategoryId)) {
      throw registrySyncError("REGISTRY_DUPLICATE_CATEGORY_ID", "ID de categoria duplicado", {
        externalCategoryId: node.externalCategoryId,
      });
    }
    byId.set(node.externalCategoryId, node);
    if (node.marketplaceKey !== context.marketplaceKey || node.siteId !== context.siteId) {
      throw registrySyncError("REGISTRY_SCOPE_MISMATCH", "Categoria fora do marketplace/site do sync", {
        externalCategoryId: node.externalCategoryId,
      });
    }
  }

  const root = byId.get(context.rootExternalCategoryId);
  if (!root || root.parentExternalCategoryId !== null) {
    throw registrySyncError("REGISTRY_INVALID_TREE", "Raiz do universo ausente ou com parent externo", {
      externalCategoryId: context.rootExternalCategoryId,
    });
  }
  if (root.pathExternalCategoryIds.length !== 1
    || root.pathExternalCategoryIds[0] !== root.externalCategoryId
    || root.pathNames.length !== 1
    || root.pathNames[0] !== root.name) {
    throw registrySyncError("REGISTRY_INVALID_PATH", "Path da raiz inválido", {
      externalCategoryId: root.externalCategoryId,
    });
  }

  for (const node of nodes) {
    if (node.externalCategoryId !== root.externalCategoryId) {
      if (node.parentExternalCategoryId === null || !byId.has(node.parentExternalCategoryId)) {
        throw registrySyncError("REGISTRY_MISSING_PARENT", "Parent ausente no universo", {
          externalCategoryId: node.externalCategoryId,
        });
      }
    }
    const ids = node.pathExternalCategoryIds;
    const names = node.pathNames;
    if (ids.length !== names.length || ids[0] !== root.externalCategoryId
      || ids.at(-1) !== node.externalCategoryId || names.at(-1) !== node.name
      || (node.parentExternalCategoryId !== null && ids.at(-2) !== node.parentExternalCategoryId)) {
      throw registrySyncError("REGISTRY_INVALID_PATH", "Path de categoria inválido", {
        externalCategoryId: node.externalCategoryId,
      });
    }
    if (node.isLeaf !== (node.childrenExternalCategoryIds.length === 0)) {
      throw registrySyncError("REGISTRY_INVALID_TREE", "Leaf flag divergente", {
        externalCategoryId: node.externalCategoryId,
      });
    }
  }
}

export function validateRegistryClassification(
  result: RegistryClassifierOutput,
  expectedExternalCategoryId: string,
  expectedVersion: string,
): void {
  if (result.externalCategoryId !== expectedExternalCategoryId) {
    throw registrySyncError("REGISTRY_INVALID_CLASSIFICATION", "Classifier retornou ID divergente", {
      externalCategoryId: expectedExternalCategoryId,
      expected: expectedExternalCategoryId,
      actual: result.externalCategoryId,
    });
  }
  if (!VALID_SCOPES.has(result.scopeStatus)
    || (result.priorityTier !== null && !VALID_TIERS.has(result.priorityTier))
    || !nonEmpty(result.ruleId)) {
    throw registrySyncError("REGISTRY_INVALID_CLASSIFICATION", "Classifier retornou campos inválidos", {
      externalCategoryId: expectedExternalCategoryId,
    });
  }
  const tierIsValid = result.scopeStatus === "ALLOWED"
    ? result.priorityTier !== null
    : result.priorityTier === null;
  if (!tierIsValid) {
    throw registrySyncError("REGISTRY_INVALID_CLASSIFICATION", "Combinação scope/tier inválida", {
      externalCategoryId: expectedExternalCategoryId,
    });
  }
  if (result.classificationVersion !== expectedVersion) {
    throw registrySyncError(
      "REGISTRY_CLASSIFICATION_VERSION_MISMATCH",
      "Versão do classifier divergente",
      { externalCategoryId: expectedExternalCategoryId, expected: expectedVersion, actual: result.classificationVersion },
    );
  }
}

export function validateCurrentMapping(mapping: CurrentVerticalCategoryMapping): void {
  const sourceIsConsistent = mapping.manualOverride
    ? mapping.decisionSource === "MANUAL" && mapping.decidedAt !== null
    : mapping.decisionSource === "AUTO";
  const tierIsValid = mapping.scopeStatus === "ALLOWED"
    ? mapping.priorityTier !== null && VALID_TIERS.has(mapping.priorityTier)
    : mapping.priorityTier === null;
  if (!VALID_SCOPES.has(mapping.scopeStatus) || !sourceIsConsistent || !tierIsValid) {
    throw registrySyncError("REGISTRY_INVALID_CURRENT_STATE", "Mapping atual semanticamente inválido", {
      externalCategoryId: mapping.externalCategoryId,
    });
  }
}
