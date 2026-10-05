import assert from "node:assert/strict";
import { normalizeName, parseLikelyTradingRange, diceSimilarity, FUZZY_MATCH_THRESHOLD } from "./stockSymbols.js";

// Corporate suffixes and punctuation are stripped, so equivalent names match.
assert.equal(normalizeName("ABB Ltd."), normalizeName("ABB LIMITED"));
assert.equal(normalizeName("A B COTSPIN INDIA LIMITED"), normalizeName("A B COTSPIN"));
assert.equal(normalizeName(""), "");
assert.equal(normalizeName(null), "");

// A different company is not equal after normalization.
assert.notEqual(normalizeName("ABB Ltd."), normalizeName("AAA TECHNOLOGIES LIMITED"));

// Range parsing: plain and comma-thousands, both bounds.
assert.deepEqual(parseLikelyTradingRange("       30.60 -        32.20"), { low: 30.6, high: 32.2 });
assert.deepEqual(parseLikelyTradingRange("    7,440.80 -     8,092.20"), { low: 7440.8, high: 8092.2 });
assert.equal(parseLikelyTradingRange(""), null);
assert.equal(parseLikelyTradingRange(null), null);
assert.equal(parseLikelyTradingRange("not a range"), null);

// Identical/empty edges.
assert.equal(diceSimilarity("ABB", "ABB"), 1);
assert.equal(diceSimilarity("", "ABB"), 0);
assert.equal(diceSimilarity("ABB", null), 0);

// A minor typo or a dropped/extra word should clear the threshold...
assert.ok(diceSimilarity(normalizeName("RELIANCE INDUSTRIES"), normalizeName("RELIANCE INDUSTRES")) >= FUZZY_MATCH_THRESHOLD);
assert.ok(diceSimilarity(normalizeName("TATA CONSULTANCY SERVICES"), normalizeName("TATA CONSULTANCY SERVICE")) >= FUZZY_MATCH_THRESHOLD);
assert.ok(diceSimilarity(normalizeName("LARSEN TOUBRO"), normalizeName("LARSEN AND TOUBRO")) >= FUZZY_MATCH_THRESHOLD);
assert.ok(diceSimilarity(normalizeName("STATE BANK"), normalizeName("STATE BANK OF INDIA")) >= FUZZY_MATCH_THRESHOLD);

// ...but a genuinely different company must not — including the "same family,
// different company" pairs that sit closest to the threshold in practice
// (a group name shared by unrelated listed entities, not a typo).
assert.ok(diceSimilarity(normalizeName("TATA MOTORS"), normalizeName("TATA STEEL")) < FUZZY_MATCH_THRESHOLD);
assert.ok(diceSimilarity(normalizeName("ABB Ltd."), normalizeName("AAA TECHNOLOGIES LIMITED")) < FUZZY_MATCH_THRESHOLD);
assert.ok(diceSimilarity(normalizeName("ADANI PORTS"), normalizeName("ADANI POWER")) < FUZZY_MATCH_THRESHOLD);
assert.ok(diceSimilarity(normalizeName("BAJAJ FINANCE"), normalizeName("BAJAJ FINSERV")) < FUZZY_MATCH_THRESHOLD);

console.log("stockSymbols: all checks passed");
