import mongoose from "mongoose";
import { escapeRegex } from "./listQuery.js";
import { buildScopeFilter } from "./scope.js";

/**
 * Global search over the `searchSources` registry (ADR-016).
 *
 * The controller decides *which* sources the caller may see; this does the
 * per-source work: build the match from the declared fields only, run it, and
 * describe each hit as { title, subtitle, matches } so the UI can highlight
 * without knowing anything about the model.
 */

export const MIN_TERM = 2;
export const MAX_TERM = 100;
export const PER_SOURCE = 5;

/** Trimmed term, or null when too short to be worth a round of queries. */
export const normaliseTerm = (raw) => {
  const term = String(raw ?? "").trim().slice(0, MAX_TERM);
  return term.length >= MIN_TERM ? term : null;
};

/** `$or` of case-insensitive contains-matches over the declared fields only. */
export const buildSearchMatch = (fields, term) => ({
  $or: Object.keys(fields).map((field) => ({
    [field]: { $regex: escapeRegex(term), $options: "i" },
  })),
});

/** Read a possibly dotted path ("actor.name") off a lean document. */
const valueAt = (doc, path) =>
  path.split(".").reduce((value, key) => (value == null ? value : value[key]), doc);

/** One lean document → what the result list shows. */
export const describeHit = (doc, source, term) => {
  const needle = term.toLowerCase();
  const matches = Object.entries(source.fields)
    .map(([field, label]) => ({ field, label, value: valueAt(doc, field) }))
    .filter(({ value }) => value != null && String(value).toLowerCase().includes(needle))
    .map(({ field, label, value }) => ({ field, label, value: String(value) }));

  const title = valueAt(doc, source.title);
  const subtitle = source.subtitle ? valueAt(doc, source.subtitle) : null;

  return {
    id: String(doc._id),
    title: title == null || title === "" ? "(untitled)" : String(title),
    subtitle: subtitle == null || subtitle === "" ? null : String(subtitle),
    matches,
  };
};

/** Fields the query has to return: every searchable field plus the display ones. */
export const projectionFor = (source) =>
  Object.fromEntries(
    [...Object.keys(source.fields), source.title, source.subtitle]
      .filter(Boolean)
      .map((field) => [field, 1]),
  );

/**
 * Search one source for a caller already cleared to read it. Soft-deleted rows
 * are excluded by the global plugin (ADR-001); the role's data scope (ADR-002)
 * is applied here.
 */
export const searchSource = async (key, source, term, reqUser) => {
  const model = mongoose.model(source.model);
  const scopeFilter = buildScopeFilter(reqUser, source.scopeable);

  const docs = await model
    .find({ ...buildSearchMatch(source.fields, term), ...(scopeFilter ?? {}) })
    .select(projectionFor(source))
    .sort({ updatedAt: -1 })
    .limit(PER_SOURCE)
    .lean();

  return {
    key,
    label: source.label,
    path: source.path,
    link: source.link,
    items: docs.map((doc) => describeHit(doc, source, term)),
  };
};
