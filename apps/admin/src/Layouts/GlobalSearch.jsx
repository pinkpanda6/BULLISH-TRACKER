import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, LayoutAlt01, SearchLg } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { MenuContext } from "@/context/MenuContext";
import { globalSearch } from "@/api/search.api";
import { cx } from "@/utils/cx";

/**
 * Header search (ADR-016): Ctrl/⌘+K from anywhere, or the button in the top bar.
 *
 * Two kinds of result:
 * - Screens — the menu tree the user can already see (MenuContext has applied
 *   their permissions), filtered here with no request.
 * - Records and log entries — GET /search, which only searches the sources the
 *   user may read and applies their data scope. Each hit carries the fields
 *   that matched, so this highlights without knowing anything about models.
 */

const MIN_TERM = 2;
const DEBOUNCE_MS = 250;
const SCREEN_LIMIT = 5;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wraps every case-insensitive occurrence of `term` in a <mark>. */
const Highlight = ({ text, term }) => {
    if (!text) return null;
    if (!term) return text;
    const parts = String(text).split(new RegExp(`(${escapeRegex(term)})`, "i"));
    return parts.map((part, i) =>
        i % 2 ? (
            <mark key={i} className="rounded-sm bg-warning-secondary px-0.5 text-primary">
                {part}
            </mark>
        ) : (
            part
        ),
    );
};

/** Visible menu tree → flat list of { name, url, groupName }. */
const flattenScreens = (groups) =>
    (groups ?? []).flatMap((group) => {
        const walk = (nodes) =>
            (nodes ?? []).flatMap((node) => [
                ...(node.url ? [{ name: node.name, url: node.url, groupName: group.groupName }] : []),
                ...walk(node.children),
            ]);
        return [...(group.url ? [{ name: group.groupName, url: group.url, groupName: null }] : []), ...walk(group.menus)];
    });

const hrefFor = (group, item, term) =>
    group.link === "list" ? `${group.path}?q=${encodeURIComponent(term)}` : `${group.path}/${item.id}`;

/** One result row. `index` is its position in the flat keyboard order. */
const Row = ({ index, isActive, onHover, onSelect, term, title, subtitle, screen, hint, children }) => (
    <li role="option" aria-selected={isActive} data-index={index}>
        <button
            type="button"
            onClick={onSelect}
            onMouseMove={() => !isActive && onHover(index)}
            className={cx(
                "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left outline-hidden",
                isActive ? "bg-secondary" : "bg-transparent",
            )}
        >
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-primary">
                    <Highlight text={title} term={term} />
                </div>
                {subtitle && (
                    <div className="truncate text-xs text-tertiary">
                        <Highlight text={subtitle} term={term} />
                    </div>
                )}
                {children}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-md border border-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary">
                    {screen}
                </span>
                {hint && <span className="text-[11px] text-quaternary">{hint}</span>}
                {isActive && <CornerDownLeft className="size-3.5 text-quaternary" aria-hidden="true" />}
            </div>
        </button>
    </li>
);

const GroupHeading = ({ children, path }) => (
    <div className="flex items-baseline justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-semibold tracking-wide text-tertiary uppercase">{children}</span>
        {path && <span className="text-[11px] text-quaternary">{path}</span>}
    </div>
);

const GlobalSearch = () => {
    const navigate = useNavigate();
    const { menuData } = useContext(MenuContext);
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState("");
    const [result, setResult] = useState({ term: null, groups: [] });
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [active, setActive] = useState(0);
    const listRef = useRef(null);

    const term = input.trim();
    const searchable = term.length >= MIN_TERM;

    // Ctrl/⌘+K opens from anywhere. (The sidebar's own Ctrl/⌘+S menu filter
    // is a different job and stays.)
    useEffect(() => {
        const onKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen(true);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);

    // Debounced, and a newer keystroke cancels the request still in flight so
    // a slow early response cannot overwrite a later one.
    useEffect(() => {
        if (!open || !searchable) {
            setResult({ term: null, groups: [] });
            setLoading(false);
            setFailed(false);
            return undefined;
        }
        const controller = new AbortController();
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const res = await globalSearch(term, controller.signal);
                setResult(res.data?.data ?? { term, groups: [] });
                setFailed(false);
            } catch (error) {
                if (error?.name === "CanceledError") return;
                setResult({ term, groups: [] });
                setFailed(true);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [open, term, searchable]);

    const screens = useMemo(() => {
        if (!searchable) return [];
        const q = term.toLowerCase();
        return flattenScreens(menuData)
            .filter((screen) => screen.name?.toLowerCase().includes(q))
            .slice(0, SCREEN_LIMIT);
    }, [menuData, term, searchable]);

    // One flat list in display order, so the arrow keys walk every row.
    const rows = useMemo(() => {
        const list = screens.map((screen) => ({ key: `screen:${screen.url}`, href: screen.url }));
        for (const group of result.groups) {
            for (const item of group.items) {
                list.push({ key: `${group.key}:${item.id}`, href: hrefFor(group, item, result.term ?? term) });
            }
        }
        return list;
    }, [screens, result, term]);

    useEffect(() => setActive(0), [rows]);

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const close = () => {
        setOpen(false);
        setInput("");
    };

    const go = (href) => {
        close();
        navigate(href);
    };

    const onInputKeyDown = (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, rows.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && rows[active]) {
            e.preventDefault();
            go(rows[active].href);
        }
    };

    const shownTerm = result.term ?? term;

    const rowProps = (key, href) => {
        const index = rows.findIndex((row) => row.key === key);
        return { index, isActive: index === active, onHover: setActive, onSelect: () => go(href), term: shownTerm };
    };

    const nothing = searchable && !loading && !failed && rows.length === 0;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Search everything"
                className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-secondary bg-primary px-2.5 text-sm text-placeholder outline-focus-ring transition hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 md:w-64 md:px-3"
            >
                <SearchLg className="size-4 text-quaternary" aria-hidden="true" />
                <span className="hidden flex-1 text-left md:inline">Search everything…</span>
                <kbd className="hidden rounded border border-secondary px-1.5 py-0.5 text-[10px] font-medium text-quaternary md:inline">
                    Ctrl K
                </kbd>
            </button>

            <ModalOverlay isOpen={open} onOpenChange={(isOpen) => !isOpen && close()} isDismissable className="sm:items-start">
                <Modal className="w-full max-w-2xl">
                    <Dialog aria-label="Search everything">
                        <div className="flex items-center gap-3 border-b border-secondary px-4">
                            <SearchLg className="size-5 shrink-0 text-quaternary" aria-hidden="true" />
                            <input
                                autoFocus
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={onInputKeyDown}
                                placeholder="Search records, logs and screens…"
                                aria-label="Search"
                                role="combobox"
                                aria-expanded={rows.length > 0}
                                aria-controls="global-search-results"
                                className="h-14 w-full bg-transparent text-md text-primary outline-hidden placeholder:text-placeholder"
                            />
                            {loading && <span className="shrink-0 text-xs text-quaternary">Searching…</span>}
                            <kbd className="shrink-0 rounded border border-secondary px-1.5 py-0.5 text-[10px] font-medium text-quaternary">
                                Esc
                            </kbd>
                        </div>

                        <div ref={listRef} className="max-h-[60vh] overflow-y-auto px-2 pb-2">
                            {!searchable && (
                                <p className="px-3 py-8 text-center text-sm text-tertiary">
                                    Type at least {MIN_TERM} characters to search every screen, record and log you have access to.
                                </p>
                            )}
                            {failed && (
                                <p className="px-3 py-8 text-center text-sm text-error-primary">Search failed. Please try again.</p>
                            )}
                            {nothing && (
                                <p className="px-3 py-8 text-center text-sm text-tertiary">
                                    No results for “<span className="font-medium text-primary">{term}</span>”.
                                </p>
                            )}

                            <ul id="global-search-results" role="listbox" aria-label="Search results">
                                {screens.length > 0 && (
                                    <li role="presentation">
                                        <GroupHeading>Screens</GroupHeading>
                                        <ul role="group">
                                            {screens.map((screen) => (
                                                <Row
                                                    key={screen.url}
                                                    {...rowProps(`screen:${screen.url}`, screen.url)}
                                                    title={screen.name}
                                                    subtitle={screen.groupName}
                                                    screen={
                                                        <span className="inline-flex items-center gap-1">
                                                            <LayoutAlt01 className="size-3" aria-hidden="true" />
                                                            Screen
                                                        </span>
                                                    }
                                                />
                                            ))}
                                        </ul>
                                    </li>
                                )}

                                {result.groups.map((group) => (
                                    <li key={group.key} role="presentation">
                                        <GroupHeading path={group.path}>{group.label}</GroupHeading>
                                        <ul role="group">
                                            {group.items.map((item) => {
                                                // Title and subtitle already show their own
                                                // highlights; list only the other fields that matched.
                                                const extra = item.matches.filter(
                                                    (m) => m.value !== item.title && m.value !== item.subtitle,
                                                );
                                                return (
                                                    <Row
                                                        key={item.id}
                                                        {...rowProps(`${group.key}:${item.id}`, hrefFor(group, item, shownTerm))}
                                                        title={item.title}
                                                        subtitle={item.subtitle}
                                                        screen={group.label}
                                                        hint={group.link === "list" ? "Opens filtered list" : null}
                                                    >
                                                        {item.matches.length > 0 && (
                                                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-tertiary">
                                                                <span>
                                                                    Matched in{" "}
                                                                    <span className="text-secondary">
                                                                        {item.matches.map((m) => m.label).join(", ")}
                                                                    </span>
                                                                </span>
                                                                {extra.map((m) => (
                                                                    <span key={m.field} className="min-w-0 truncate">
                                                                        {m.label}: <Highlight text={m.value} term={shownTerm} />
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </Row>
                                                );
                                            })}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="flex items-center gap-4 border-t border-secondary px-4 py-2 text-[11px] text-quaternary">
                            <span>↑ ↓ to move</span>
                            <span>Enter to open</span>
                            <span className="ml-auto">Only shows what your role can see</span>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </>
    );
};

export default GlobalSearch;
