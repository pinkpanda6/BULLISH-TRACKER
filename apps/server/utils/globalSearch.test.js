// The two global plugins must be compiled before any model — same rule as
// server.js — so the models below can be loaded to check field types.
import "../models/softDelete.js";
import "../models/auditPlugin.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import mongoose from "mongoose";
import { buildSearchMatch, describeHit, normaliseTerm, projectionFor, MAX_TERM } from "./globalSearch.js";
import { SEARCH_SOURCES } from "../config/searchSources.js";

// Too-short terms never reach the database; long ones are capped.
assert.equal(normaliseTerm(""), null);
assert.equal(normaliseTerm(" a "), null);
assert.equal(normaliseTerm(undefined), null);
assert.equal(normaliseTerm("  in "), "in");
assert.equal(normaliseTerm("x".repeat(500)).length, MAX_TERM);

// The match covers the declared fields only, with the term escaped — a
// search for "a.b" must not turn into "a, any char, b".
{
  const match = buildSearchMatch({ name: "Name", "actor.email": "Email" }, "a.b(");
  assert.deepEqual(match, {
    $or: [
      { name: { $regex: "a\\.b\\(", $options: "i" } },
      { "actor.email": { $regex: "a\\.b\\(", $options: "i" } },
    ],
  });
}

// A hit reports which fields matched, case-insensitively, including dotted paths.
{
  const source = {
    fields: { recordLabel: "Record", "actor.name": "Changed by", "actor.email": "Email" },
    title: "recordLabel",
    subtitle: "model",
  };
  const hit = describeHit(
    { _id: "abc", recordLabel: "Sales", model: "Department", actor: { name: "Sally", email: "x@y.z" } },
    source,
    "SAL",
  );
  assert.deepEqual(hit, {
    id: "abc",
    title: "Sales",
    subtitle: "Department",
    matches: [
      { field: "recordLabel", label: "Record", value: "Sales" },
      { field: "actor.name", label: "Changed by", value: "Sally" },
    ],
  });
}

// Missing display values degrade instead of throwing.
{
  const hit = describeHit({ _id: 1 }, { fields: { name: "Name" }, title: "name" }, "zz");
  assert.equal(hit.title, "(untitled)");
  assert.equal(hit.subtitle, null);
  assert.deepEqual(hit.matches, []);
}

// Every registry entry is complete, gated, and never exposes a secret.
const SECRET = /password|otp|secret|token/i;
for (const [key, source] of Object.entries(SEARCH_SOURCES)) {
  assert.ok(source.model && source.label && source.path && source.title, `${key}: incomplete`);
  assert.ok(Object.keys(source.fields).length, `${key}: no fields`);
  assert.ok(["record", "list"].includes(source.link), `${key}: bad link`);
  assert.ok(
    Boolean(source.access?.adminOnly) !== Boolean(source.access?.menuUrl),
    `${key}: needs exactly one of access.menuUrl / access.adminOnly`,
  );
  for (const field of Object.keys(projectionFor(source))) {
    assert.ok(!SECRET.test(field), `${key}: secret-looking field "${field}" is searchable`);
  }
}

// Every searchable field is a String on the real model — a regex against an
// ObjectId or Number field makes Mongoose throw, which takes the whole search
// down, not just that source.
const modelsDir = new URL("../models/", import.meta.url);
for (const file of fs.readdirSync(modelsDir)) {
  if (file.endsWith(".js") && !file.endsWith(".test.js")) await import(new URL(file, modelsDir));
}
for (const [key, source] of Object.entries(SEARCH_SOURCES)) {
  const schema = mongoose.model(source.model).schema;
  for (const field of Object.keys(source.fields)) {
    assert.equal(schema.path(field)?.instance, "String", `${key}: "${field}" is not a String field`);
  }
}

console.log("globalSearch: all checks passed");
