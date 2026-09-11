import {AUTOMOTIVE_MLB_DISCOVERY_V1} from './planner.js';
// Explicit reviewed expansion; the frozen V1 taxonomy and first-sync contract stay reproducible.
export const AUTOMOTIVE_TOOL_CATEGORY_IDS = Object.freeze(["MLB115943","MLB115944","MLB115945","MLB437802","MLB437783","MLB437784","MLB459157","MLB459347","MLB459348","MLB271712","MLB455313"]);
export const AUTOMOTIVE_MLB_DISCOVERY_TOOLS = Object.freeze({
 ...AUTOMOTIVE_MLB_DISCOVERY_V1, configVersion:'automotive-mlb-discovery/tools-v2',
 expectedEligibleCategories:155,
});
