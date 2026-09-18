import {AUTOMOTIVE_MLB_DISCOVERY_V1} from './planner.js';
// Explicit reviewed expansion; the frozen V1 taxonomy and first-sync contract stay reproducible.
export const AUTOMOTIVE_TOOL_CATEGORY_IDS = Object.freeze(["MLB115943","MLB115944","MLB115945","MLB437802","MLB437783","MLB437784","MLB459157","MLB459347","MLB459348","MLB271712","MLB455313"]);
// Broad-audience accessories reviewed for curated-v3; the tools-v2 set above stays frozen.
export const AUTOMOTIVE_CURATED_V3_CATEGORY_IDS = Object.freeze(["MLB271108","MLB46692","MLB431858","MLB277952","MLB430923","MLB430913","MLB429491","MLB459455","MLB459471","MLB6170","MLB255106","MLB459195","MLB459150","MLB430581","MLB429029","MLB5759","MLB418074","MLB22204","MLB22879","MLB277590","MLB430631","MLB438313","MLB438314","MLB3930","MLB271558"]);
export const AUTOMOTIVE_MLB_DISCOVERY_TOOLS = Object.freeze({
 ...AUTOMOTIVE_MLB_DISCOVERY_V1, configVersion:'automotive-mlb-discovery/curated-v3',
 expectedEligibleCategories:180,
});
