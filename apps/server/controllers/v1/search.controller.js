import { SEARCH_SOURCES } from "../../config/searchSources.js";
import { hasPermission } from "../../middlewares/checkPermission.js";
import { ROLES } from "@demo-panel/shared/roles";
import { normaliseTerm, searchSource } from "../../utils/globalSearch.js";

/**
 * Global search (ADR-016): one term, every source the caller may read.
 *
 * A source is searched only when the caller passes the same gate as that
 * source's own list route — the matrix "read" flag for `access.menuUrl`, or
 * ADMIN for `access.adminOnly`. Sources the caller cannot see are skipped
 * silently: search must not reveal that a screen exists, let alone its rows.
 */
export const globalSearch = async (req, res) => {
  try {
    const term = normaliseTerm(req.query.q);
    if (!term) {
      return res.status(200).json({ isOk: true, status: 200, data: { term: null, groups: [] } });
    }

    // Sequential on purpose: hasPermission may write the session on first
    // resolve, and every lookup after the first is a cache hit anyway.
    const allowed = [];
    for (const [key, source] of Object.entries(SEARCH_SOURCES)) {
      if (source.access.adminOnly) {
        if (req.user.role === ROLES.ADMIN) allowed.push([key, source]);
        continue;
      }
      const verdict = await hasPermission(req, source.access.menuUrl, "read");
      if (verdict === "invalid") {
        res.clearCookie("sessionId");
        return res.status(401).json({ isOk: false, status: 401, message: "Session invalid or expired" });
      }
      if (verdict === "allowed") allowed.push([key, source]);
    }

    // One broken source must not blank the whole search: log it and return
    // the rest.
    const settled = await Promise.allSettled(
      allowed.map(([key, source]) => searchSource(key, source, term, req.user)),
    );
    const groups = settled.flatMap((result, i) => {
      if (result.status === "fulfilled") return result.value.items.length ? [result.value] : [];
      console.error(`Error in globalSearch source "${allowed[i][0]}":`, result.reason);
      return [];
    });

    return res.status(200).json({ isOk: true, status: 200, data: { term, groups } });
  } catch (error) {
    console.error("Error in globalSearch:", error);
    return res.status(500).json({ isOk: false, status: 500, message: "Internal server error" });
  }
};
