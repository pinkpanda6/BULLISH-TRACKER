import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell01 } from "@untitledui/icons";
import { getTodayAlertCount, listWatchlists } from "@/api/stockTracker.api";

/**
 * Today's bullish-crossover alert count (PRD scope item 4), polled on the
 * same ~60s cadence as the price-fetch job itself so it never feels stale.
 * The badge "clears" on its own at midnight IST — `today-count` is a live
 * count of today's `StockAlert` rows, not a seen/unseen flag to manage.
 *
 * Independent per watchlist (user choice, 2026-09-29 — not combined across
 * containers), so this needs to know which one is "current" even though it
 * lives in the persistent header, outside the Watchlist page itself. Reads
 * the same localStorage key that page writes on every switch — loosely
 * coupled on purpose (no context provider for one read), so it catches up
 * within one poll tick of a switch, not instantly.
 */
const POLL_MS = 60 * 1000;
// Must match Watchlist.jsx's LAST_WATCHLIST_KEY.
const LAST_WATCHLIST_KEY = "bullishTracker:lastWatchlistId";

const AlertBadge = () => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let cancelled = false;

        const resolveWatchlistId = async () => {
            try {
                const stored = localStorage.getItem(LAST_WATCHLIST_KEY);
                if (stored) return stored;
            } catch {
                // Private browsing / blocked storage — fall through to the API.
            }
            const response = await listWatchlists();
            return response.data?.data?.[0]?._id ?? null;
        };

        const poll = async () => {
            try {
                const watchlistId = await resolveWatchlistId();
                if (!watchlistId) return;
                const response = await getTodayAlertCount(watchlistId);
                if (!cancelled) setCount(response.data?.data?.count ?? 0);
            } catch {
                // Silent — a missed poll just tries again next tick. Not
                // worth a toast for a header decoration.
            }
        };
        poll();
        const handle = setInterval(poll, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(handle);
        };
    }, []);

    return (
        <Link
            to="/watchlist?tab=alerts"
            aria-label={count > 0 ? `${count} stock alert${count === 1 ? "" : "s"} today` : "Stock alerts"}
            className="relative flex size-9 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
        >
            <Bell01 className="size-5" />
            {count > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error-solid px-1 text-[10px] font-semibold leading-none text-white">
                    {count > 99 ? "99+" : count}
                </span>
            )}
        </Link>
    );
};

export default AlertBadge;
