export {
  classifyAutomotiveCategory,
  isAutomaticAutomotiveDiscoveryEligible,
} from "./classifier.js";
export { AUTOMOTIVE_MLB_RULES_V1 } from "./rules.js";
export {
  AUTOMOTIVE_CLASSIFICATION_VERSION,
  AUTOMOTIVE_ROOT_CATEGORY_ID,
  AutomotiveClassifierError,
} from "./types.js";
export type {
  AutomotiveCategoryClassification,
  AutomotiveCategoryRule,
  AutomotiveClassificationReason,
  AutomotiveClassifierRules,
  AutomotivePriorityTier,
  AutomotiveScopeStatus,
} from "./types.js";
export { validateAutomotiveClassifierRules } from "./validation.js";
