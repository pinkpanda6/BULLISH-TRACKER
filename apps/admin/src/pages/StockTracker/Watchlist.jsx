import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import * as XLSX from "xlsx";
import { Upload04, RefreshCw01, Check, List, ClockRewind, AlertCircle, Bell01, Plus, Edit01, Trash01 } from "@untitledui/icons";
import {
    searchWatchlist,
    importWatchlist,
    searchSymbol,
    confirmMapping,
    searchAlerts,
    updateTrackedStock,
    deleteTrackedStock,
    manualAddStock,
    listWatchlists,
    createWatchlist,
    renameWatchlist,
    deleteWatchlist,
} from "../../api/stockTracker.api";
import DataTable from "@/components/ui/data-table";
import { Card, PageHeader, RowActions } from "@/components/ui/page";
import { FormModal, FormFooter, ConfirmModal } from "@/components/ui/modal";
import { Field, SelectField } from "@/components/ui/field";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { cx } from "@/utils/cx";

/**
 * The Bullish Tracker's watchlist (PRD scope items 3-4). Not CRUD — the point
 * is a monthly import, a name-matching review queue, and live price tracking
 * — so this is a custom page rather than an entity config (system-design
 * decision-tree step 4).
 *
 * Module 2 turns on live data: the % proximity column (CALC-1), the Crossed
 * Above tab's real content, and a 4th Alerts tab. The header's alert badge
 * (`Layouts/AlertBadge.jsx`) links here with `?tab=alerts`.
 */

const TABS = [
    { key: "watchlist", label: "Watchlist", icon: List },
    { key: "crossed", label: "Crossed Above", icon: ClockRewind },
    { key: "review", label: "Needs Review", icon: AlertCircle },
    { key: "alerts", label: "Alerts", icon: Bell01 },
];

// Remembers which container was open, per browser (multiple watchlists,
// 2026-09-29) — read by this page and by Layouts/AlertBadge.jsx, loosely, on
// its own polling cadence rather than through shared state.
const LAST_WATCHLIST_KEY = "bullishTracker:lastWatchlistId";

const filtersForTab = (tab) => {
    if (tab === "watchlist") {
        return { filters: [{ field: "symbolMapping", op: "isNotEmpty" }, { field: "crossedAt", op: "isEmpty" }], matchType: "all" };
    }
    if (tab === "crossed") {
        return { filters: [{ field: "crossedAt", op: "isNotEmpty" }], matchType: "all" };
    }
    return { filters: [{ field: "symbolMapping", op: "isEmpty" }], matchType: "all" };
};

const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDateTime = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
};

// CALC-1: how far (in %) the live price still has to rise to reach the
// target. Zero at the moment of crossing, negative once above it.
const proximityPercent = (target, livePrice) => {
    if (typeof target !== "number" || typeof livePrice !== "number" || livePrice === 0) return null;
    return ((target - livePrice) / livePrice) * 100;
};

const ProximityCell = ({ target, livePrice }) => {
    const pct = proximityPercent(target, livePrice);
    if (pct === null) return <span className="text-quaternary">-</span>;
    const crossed = pct <= 0;
    return (
        <span className={cx("tabular-nums font-medium", crossed ? "text-fg-success-primary" : "text-secondary")}>
            {pct.toFixed(1)}%
        </span>
    );
};

const Watchlist = () => {
    const [searchParams] = useSearchParams();
    const [tab, setTab] = useState(() => {
        const requested = searchParams.get("tab");
        return TABS.some((t) => t.key === requested) ? requested : "watchlist";
    });

    // The header alert badge links here with ?tab=alerts. Since the sidebar
    // only ever leads back to this same route, clicking it while already on
    // /watchlist doesn't remount the page — just updates the URL — so the
    // initial-mount read above never fires again on its own. Without this,
    // the button silently did nothing once you were already here.
    useEffect(() => {
        const requested = searchParams.get("tab");
        if (requested && TABS.some((t) => t.key === requested)) {
            setTab(requested);
        }
    }, [searchParams]);

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalRows, setTotalRows] = useState(0);
    const [perPage, setPerPage] = useState(25);
    const [pageNo, setPageNo] = useState(1);
    const [query, setQuery] = useState("");
    const [sortField, setSortField] = useState("proximityPercent");
    const [sortDirection, setSortDirection] = useState("asc");

    const [importOpen, setImportOpen] = useState(false);
    const [importMode, setImportMode] = useState("update");
    const [importFile, setImportFile] = useState(null);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef(null);

    const [reviewing, setReviewing] = useState(null); // { _id, scripName, close, target }
    const [mappingQuery, setMappingQuery] = useState("");
    const [mappingResults, setMappingResults] = useState([]);
    const [mappingSearching, setMappingSearching] = useState(false);
    const [mappingSaving, setMappingSaving] = useState(false);

    const [editing, setEditing] = useState(null); // the row being edited
    const [editForm, setEditForm] = useState({ scripName: "", close: "", target: "" });
    const [editSaving, setEditSaving] = useState(false);

    const [removing, setRemoving] = useState(null); // the row being deleted
    const [removeError, setRemoveError] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [addOpen, setAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({ scripName: "", close: "", target: "" });
    const [addSaving, setAddSaving] = useState(false);
    const [addDuplicate, setAddDuplicate] = useState(null); // the existing row, once the server says it's a duplicate

    const [watchlists, setWatchlists] = useState([]);
    const [currentWatchlistId, setCurrentWatchlistId] = useState(null);
    const [watchlistsLoading, setWatchlistsLoading] = useState(true);

    const [newWatchlistOpen, setNewWatchlistOpen] = useState(false);
    const [newWatchlistName, setNewWatchlistName] = useState("");
    const [newWatchlistSaving, setNewWatchlistSaving] = useState(false);

    const [renamingWatchlist, setRenamingWatchlist] = useState(null); // the watchlist being renamed
    const [renameValue, setRenameValue] = useState("");
    const [renameSaving, setRenameSaving] = useState(false);

    const [deletingWatchlist, setDeletingWatchlist] = useState(null); // the watchlist being deleted
    const [watchlistDeleting, setWatchlistDeleting] = useState(false);

    useEffect(() => {
        const loadWatchlists = async () => {
            setWatchlistsLoading(true);
            try {
                const response = await listWatchlists();
                const list = response.data?.data ?? [];
                setWatchlists(list);
                let stored = null;
                try {
                    stored = localStorage.getItem(LAST_WATCHLIST_KEY);
                } catch {
                    // Private browsing / blocked storage — just fall back below.
                }
                const validStored = list.find((w) => w._id === stored);
                setCurrentWatchlistId(validStored ? stored : (list[0]?._id ?? null));
            } catch (error) {
                console.error("Error loading watchlists:", error);
                toast.error("Could not load your watchlists");
            } finally {
                setWatchlistsLoading(false);
            }
        };
        loadWatchlists();
    }, []);

    useEffect(() => {
        if (!currentWatchlistId) return;
        try {
            localStorage.setItem(LAST_WATCHLIST_KEY, currentWatchlistId);
        } catch {
            // Per-viewer convenience only — nothing breaks without it.
        }
    }, [currentWatchlistId]);

    const submitNewWatchlist = async () => {
        if (!newWatchlistName.trim()) {
            toast.error("Give the watchlist a name");
            return;
        }
        setNewWatchlistSaving(true);
        try {
            const response = await createWatchlist(newWatchlistName.trim());
            const created = response.data?.data;
            setWatchlists((prev) => [...prev, created]);
            setCurrentWatchlistId(created._id);
            setNewWatchlistOpen(false);
            setNewWatchlistName("");
            toast.success(`"${created.name}" created`);
        } catch (error) {
            toast.error(error.response?.data?.message || "Could not create that watchlist");
        } finally {
            setNewWatchlistSaving(false);
        }
    };

    const openRenameWatchlist = (watchlist) => {
        setRenamingWatchlist(watchlist);
        setRenameValue(watchlist.name);
    };

    const submitRenameWatchlist = async () => {
        if (!renameValue.trim()) {
            toast.error("Give the watchlist a name");
            return;
        }
        setRenameSaving(true);
        try {
            const response = await renameWatchlist(renamingWatchlist._id, renameValue.trim());
            const updated = response.data?.data;
            setWatchlists((prev) => prev.map((w) => (w._id === updated._id ? updated : w)));
            setRenamingWatchlist(null);
            toast.success("Renamed");
        } catch (error) {
            toast.error(error.response?.data?.message || "Could not rename that watchlist");
        } finally {
            setRenameSaving(false);
        }
    };

    // Deletes the watchlist AND every stock/alert inside it (owner's explicit
    // choice, 2026-09-30 — not a "must be empty first" guard). If the one
    // being deleted is the one currently open, switches to whatever remains;
    // if it was the last one, `listWatchlists` creates a fresh default on the
    // next load, same as a brand-new install.
    const openDeleteWatchlist = (watchlist) => setDeletingWatchlist(watchlist);

    const confirmDeleteWatchlist = async () => {
        setWatchlistDeleting(true);
        try {
            await deleteWatchlist(deletingWatchlist._id);
            const remaining = watchlists.filter((w) => w._id !== deletingWatchlist._id);
            setWatchlists(remaining);
            if (currentWatchlistId === deletingWatchlist._id) {
                setCurrentWatchlistId(remaining[0]?._id ?? null);
            }
            toast.success(`"${deletingWatchlist.name}" deleted`);
            setDeletingWatchlist(null);
        } catch (error) {
            toast.error(error.response?.data?.message || "Could not delete that watchlist");
        } finally {
            setWatchlistDeleting(false);
        }
    };

    const fetchRows = async () => {
        if (!currentWatchlistId) return;
        setLoading(true);
        try {
            if (tab === "alerts") {
                const response = await searchAlerts({
                    skip: Math.max((pageNo - 1) * perPage, 0),
                    per_page: perPage,
                    sorton: sortField,
                    sortdir: sortDirection,
                    watchlistId: currentWatchlistId,
                });
                const first = response.data?.data?.[0];
                setRows(first?.data ?? []);
                setTotalRows(first?.count ?? 0);
                return;
            }

            // Sorted server-side (CALC-1's proximityPercent is computed in the
            // aggregation, not stored — see stockTracker.controller.js), so
            // this orders the whole watchlist, not just the loaded page.
            const response = await searchWatchlist({
                skip: Math.max((pageNo - 1) * perPage, 0),
                per_page: perPage,
                sorton: sortField,
                sortdir: sortDirection,
                match: query,
                watchlistId: currentWatchlistId,
                ...filtersForTab(tab),
            });
            const first = response.data?.data?.[0];
            setRows(first?.data ?? []);
            setTotalRows(first?.count ?? 0);
        } catch (error) {
            console.error("Error loading watchlist:", error);
            setRows([]);
            setTotalRows(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, pageNo, perPage, query, sortField, sortDirection, currentWatchlistId]);

    useEffect(() => {
        setPageNo(1);
        // A sensible default per tab: closest-to-target for the two
        // price-driven tabs, newest-first for alerts, alphabetical otherwise
        // (Needs Review has no live price yet, so proximity means nothing).
        if (tab === "alerts") {
            setSortField("crossedAt");
            setSortDirection("desc");
        } else if (tab === "review") {
            setSortField("scripName");
            setSortDirection("asc");
        } else {
            setSortField("proximityPercent");
            setSortDirection("asc");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, query]);

    // Debounced live search against Yahoo Finance, for the confirm-mapping picker.
    useEffect(() => {
        if (!reviewing) return;
        if (mappingQuery.trim().length < 2) {
            setMappingResults([]);
            return;
        }
        const handle = setTimeout(async () => {
            setMappingSearching(true);
            try {
                const response = await searchSymbol(mappingQuery.trim());
                setMappingResults(response.data?.data ?? []);
            } catch (error) {
                console.error("Symbol search failed:", error);
                setMappingResults([]);
            } finally {
                setMappingSearching(false);
            }
        }, 350);
        return () => clearTimeout(handle);
    }, [mappingQuery, reviewing]);

    const openReview = (row) => {
        setReviewing(row);
        setMappingQuery(row.scripName);
        setMappingResults([]);
    };

    const pickMapping = async (candidate) => {
        setMappingSaving(true);
        try {
            await confirmMapping(reviewing._id, candidate.symbol, candidate.longName);
            toast.success(`${reviewing.scripName} mapped to ${candidate.symbol}`);
            setReviewing(null);
            fetchRows();
        } catch (error) {
            toast.error(error.response?.data?.message || "Could not save that mapping");
        } finally {
            setMappingSaving(false);
        }
    };

    const openEdit = (row) => {
        setEditing(row);
        setEditForm({ scripName: row.scripName, close: row.close, target: row.target });
    };

    const submitEdit = async () => {
        if (!editForm.scripName.trim() || editForm.close === "" || editForm.target === "") {
            toast.error("Scrip Name, Close and Target are all required");
            return;
        }
        setEditSaving(true);
        try {
            await updateTrackedStock(editing._id, {
                scripName: editForm.scripName.trim(),
                close: Number(editForm.close),
                target: Number(editForm.target),
            });
            toast.success("Saved");
            setEditing(null);
            fetchRows();
        } catch (error) {
            toast.error(error.response?.data?.message || "Could not save those changes");
        } finally {
            setEditSaving(false);
        }
    };

    const confirmDelete = async () => {
        setIsDeleting(true);
        setRemoveError(null);
        try {
            await deleteTrackedStock(removing._id);
            toast.success(`${removing.scripName} removed`);
            setRemoving(null);
            fetchRows();
        } catch (error) {
            const data = error.response?.data;
            if (data?.status === 409) {
                setRemoveError(data.formattedMessage || data.message);
            } else {
                toast.error(data?.message || "Could not remove that stock");
                setRemoving(null);
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const openAdd = () => {
        setAddForm({ scripName: "", close: "", target: "" });
        setAddDuplicate(null);
        setAddOpen(true);
    };

    // No onDuplicate on the first attempt; if the server reports a clash it
    // comes back as `addDuplicate` and this same button, clicked again,
    // resends with the user's choice (see the duplicate-choice buttons below).
    const submitAdd = async (onDuplicate) => {
        if (!addForm.scripName.trim() || addForm.close === "" || addForm.target === "") {
            toast.error("Scrip Name, Close and Target are all required");
            return;
        }
        setAddSaving(true);
        try {
            const response = await manualAddStock(
                {
                    scripName: addForm.scripName.trim(),
                    close: Number(addForm.close),
                    target: Number(addForm.target),
                    watchlistId: currentWatchlistId,
                },
                onDuplicate,
            );
            toast.success(response.data?.message || "Added");
            setAddOpen(false);
            setAddDuplicate(null);
            setTab("watchlist");
            fetchRows();
        } catch (error) {
            const data = error.response?.data;
            if (data?.status === 409 && data?.data?.existing) {
                setAddDuplicate(data.data.existing);
            } else {
                toast.error(data?.message || "Could not add that stock");
            }
        } finally {
            setAddSaving(false);
        }
    };

    // Every row from a "just a name and a trigger price" sheet — Shape B,
    // whatever its column is labelled (2026-09-29: seen as "r1" on a real
    // pivot-report export, and as no header at all on a hand-built one). Any
    // row where column A is text and column B is a number counts as a data
    // row; a title, a header label, or a blank line all fail that test and
    // are skipped, wherever they sit in the sheet.
    const parseTwoColumnRows = (rows) =>
        rows
            .filter((r) => {
                const name = String(r[0] ?? "").trim();
                const price = Number(r[1]);
                return Boolean(name) && Number.isFinite(price);
            })
            .map((r) => ({ scripName: String(r[0]).trim(), target: Number(r[1]) }));

    // Three supported source-file shapes (2026-09-29). Detected, not chosen
    // by the user — one less thing to get wrong on a monthly upload.
    const parseWorkbookFile = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Could not read that file"));
            reader.onload = () => {
                try {
                    const workbook = XLSX.read(reader.result, { type: "array" });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

                    // Every shape seen so far starts with title rows, then one
                    // real header row with "Scrip Name" in column A — find it
                    // rather than assuming a fixed row number.
                    const headerIndex = grid.findIndex((r) => String(r[0]).trim().toLowerCase() === "scrip name");

                    if (headerIndex !== -1) {
                        const headerRow = grid[headerIndex];
                        const labelledColumns = headerRow.filter((cell) => String(cell ?? "").trim() !== "").length;

                        if (labelledColumns >= 3) {
                            // Shape A: "Scrip Name" / "Close" / a Low-High range
                            // column (the original monthly "Lever Report").
                            const parsed = grid
                                .slice(headerIndex + 1)
                                .filter((r) => String(r[0] || "").trim())
                                .map((r) => ({
                                    scripName: String(r[0]).trim(),
                                    close: r[1],
                                    likelyTradingRange: String(r[2] ?? ""),
                                }));
                            resolve(parsed);
                            return;
                        }

                        // Shape B, with a header row: "Scrip Name" and exactly
                        // one other labelled column, whatever it's called —
                        // "r1", "Trigger Price", anything. That column's value
                        // is the target directly, no Close, no range.
                        resolve(parseTwoColumnRows(grid.slice(headerIndex + 1)));
                        return;
                    }

                    // Shape B, no header row at all — scan every row.
                    const parsed = parseTwoColumnRows(grid);
                    if (!parsed.length) {
                        throw new Error(
                            'Could not find a "Scrip Name" header, or any rows with a name and a price in the first two columns',
                        );
                    }
                    resolve(parsed);
                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsArrayBuffer(file);
        });

    const submitImport = async () => {
        if (!importFile) {
            toast.error("Choose a .xlsx file first");
            return;
        }
        setImporting(true);
        try {
            const parsedRows = await parseWorkbookFile(importFile);
            if (!parsedRows.length) {
                toast.error("No rows found in that file");
                return;
            }
            const response = await importWatchlist(parsedRows, importMode, currentWatchlistId);
            const summary = response.data?.data;
            toast.success(response.data?.message || "Import complete");
            setImportOpen(false);
            setImportFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setTab(summary?.needsReview?.length ? "review" : "watchlist");
            fetchRows();
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || "Import failed");
        } finally {
            setImporting(false);
        }
    };

    const columns = useMemo(() => {
        if (tab === "alerts") {
            return [
                { name: "Scrip Name", minWidth: "220px", selector: (row) => row.trackedStockDoc?.scripName ?? "-" },
                {
                    name: "Price at crossing",
                    minWidth: "140px",
                    sortable: true,
                    sortField: "priceAtCross",
                    selector: (row) => <span className="tabular-nums">{row.priceAtCross?.toFixed?.(2) ?? row.priceAtCross}</span>,
                },
                {
                    name: "Target",
                    minWidth: "120px",
                    sortable: true,
                    sortField: "target",
                    selector: (row) => <span className="tabular-nums">{row.target?.toFixed?.(2) ?? row.target}</span>,
                },
                {
                    name: "When",
                    minWidth: "180px",
                    sortable: true,
                    sortField: "crossedAt",
                    selector: (row) => formatDateTime(row.crossedAt),
                },
            ];
        }

        const base = [
            { name: "Scrip Name", minWidth: "220px", sortable: true, sortField: "scripName", selector: (row) => row.scripName },
            {
                name: "Close",
                maxWidth: "110px",
                sortable: true,
                sortField: "close",
                selector: (row) =>
                    typeof row.close === "number" ? (
                        <span className="tabular-nums">{row.close.toFixed(2)}</span>
                    ) : (
                        <span className="text-quaternary">-</span>
                    ),
            },
            {
                name: "Target",
                maxWidth: "110px",
                sortable: true,
                sortField: "target",
                selector: (row) => <span className="tabular-nums">{row.target?.toFixed?.(2) ?? row.target}</span>,
            },
        ];

        if (tab === "review") {
            return [
                ...base,
                {
                    name: "Actions",
                    minWidth: "190px",
                    selector: (row) => (
                        <div className="flex items-center gap-1">
                            <Button size="sm" color="secondary" onClick={() => openReview(row)}>
                                Match
                            </Button>
                            <RowActions onEdit={() => openEdit(row)} onRemove={() => setRemoving(row)} />
                        </div>
                    ),
                },
            ];
        }

        const symbolColumn = {
            name: "Symbol",
            minWidth: "130px",
            selector: (row) => row.symbolMappingDoc?.symbol || <span className="text-quaternary">-</span>,
        };
        const livePriceColumn = {
            name: "Live price",
            minWidth: "110px",
            sortable: true,
            sortField: "livePrice",
            selector: (row) =>
                typeof row.livePrice === "number" ? (
                    <span className="tabular-nums">{row.livePrice.toFixed(2)}</span>
                ) : (
                    <span className="text-quaternary">Not fetched yet</span>
                ),
        };
        const proximityColumn = {
            name: "To target",
            minWidth: "100px",
            sortable: true,
            sortField: "proximityPercent",
            selector: (row) => <ProximityCell target={row.target} livePrice={row.livePrice} />,
        };
        const lastFetchedColumn = {
            name: "Last fetched",
            minWidth: "150px",
            sortable: true,
            sortField: "lastFetchedAt",
            selector: (row) => formatDateTime(row.lastFetchedAt),
        };
        const actionsColumn = {
            name: "Actions",
            minWidth: "100px",
            selector: (row) => <RowActions onEdit={() => openEdit(row)} onRemove={() => setRemoving(row)} />,
        };

        if (tab === "crossed") {
            return [
                ...base,
                symbolColumn,
                livePriceColumn,
                proximityColumn,
                { name: "Crossed on", minWidth: "140px", sortable: true, sortField: "crossedAt", selector: (row) => formatDate(row.crossedAt) },
                lastFetchedColumn,
                actionsColumn,
            ];
        }

        return [
            ...base,
            symbolColumn,
            {
                name: "Status",
                maxWidth: "120px",
                selector: (row) =>
                    row.symbolMappingDoc ? (
                        <Badge color="success" size="sm">Mapped</Badge>
                    ) : (
                        <Badge color="warning" size="sm">Unmapped</Badge>
                    ),
            },
            livePriceColumn,
            proximityColumn,
            lastFetchedColumn,
            actionsColumn,
        ];
    }, [tab]);

    document.title = "Watchlist | Demo Panel";

    return (
        <>
            <PageHeader
                title="Watchlist"
                pageTitle="Bullish Tracker"
                description="Stocks tracked against their monthly Likely Trading High target."
                query={query}
                setQuery={setQuery}
                searchPlaceholder="Search scrip name..."
                actions={
                    <>
                        <Button color="secondary" iconLeading={RefreshCw01} onClick={fetchRows}>
                            Refresh
                        </Button>
                        <Button color="secondary" iconLeading={Plus} onClick={openAdd}>
                            Add stock
                        </Button>
                        <Button iconLeading={Upload04} onClick={() => setImportOpen(true)}>
                            Import
                        </Button>
                    </>
                }
            />

            <div className="mt-5 flex flex-wrap items-center gap-2">
                {watchlists.map((watchlist) => (
                    <div
                        key={watchlist._id}
                        className={cx(
                            "group flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm font-medium transition-colors",
                            watchlist._id === currentWatchlistId
                                ? "border-brand bg-brand-primary text-brand-secondary"
                                : "border-secondary text-tertiary hover:text-secondary",
                        )}
                    >
                        <button type="button" onClick={() => setCurrentWatchlistId(watchlist._id)}>
                            {watchlist.name}
                        </button>
                        <Dropdown.Root>
                            <Dropdown.DotsButton aria-label={`${watchlist.name} options`} className="p-1" />
                            <Dropdown.Popover className="w-40">
                                <Dropdown.Menu
                                    onAction={(key) => {
                                        if (key === "rename") openRenameWatchlist(watchlist);
                                        if (key === "delete") openDeleteWatchlist(watchlist);
                                    }}
                                >
                                    <Dropdown.Item id="rename" icon={Edit01}>
                                        Rename
                                    </Dropdown.Item>
                                    <Dropdown.Item id="delete" icon={Trash01}>
                                        Delete
                                    </Dropdown.Item>
                                </Dropdown.Menu>
                            </Dropdown.Popover>
                        </Dropdown.Root>
                    </div>
                ))}
                <Button size="sm" color="tertiary" iconLeading={Plus} onClick={() => setNewWatchlistOpen(true)}>
                    New watchlist
                </Button>
            </div>

            <div className="mt-3 flex gap-1 rounded-lg bg-secondary p-1">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={cx(
                            "flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
                            tab === key ? "bg-primary text-primary shadow-xs ring-1 ring-secondary" : "text-tertiary hover:text-secondary",
                        )}
                    >
                        <Icon className="size-4" />
                        {label}
                    </button>
                ))}
            </div>

            <Card>
                <DataTable
                    ariaLabel="Watchlist"
                    columns={columns}
                    data={rows}
                    progressPending={loading}
                    noDataComponent={
                        tab === "review"
                            ? "Nothing waiting on a manual match right now."
                            : tab === "crossed"
                              ? "No stock has crossed its target yet."
                              : tab === "alerts"
                                ? "No alerts yet — they appear here the moment a stock crosses its target."
                                : "Nothing tracked yet — import the monthly sheet to get started."
                    }
                    onSort={(col, direction) => {
                        if (!col.sortField) return;
                        setSortField(col.sortField);
                        setSortDirection(direction);
                    }}
                    paginationTotalRows={totalRows}
                    paginationPerPage={perPage}
                    paginationRowsPerPageOptions={[25, 50, 100, 250]}
                    onChangeRowsPerPage={setPerPage}
                    onChangePage={setPageNo}
                />
            </Card>

            <FormModal
                isOpen={importOpen}
                onClose={() => setImportOpen(false)}
                title="Import the monthly watchlist"
                footer={
                    <FormFooter
                        onCancel={() => setImportOpen(false)}
                        onSubmit={submitImport}
                        isLoading={importing}
                        submitLabel="Import"
                        loadingLabel="Importing..."
                    />
                }
            >
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-secondary">Sheet (.xlsx)</label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-tertiary file:mr-3 file:rounded-md file:border-0 file:bg-brand-solid file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                    />
                </div>

                <SelectField
                    label="What should this import do?"
                    options={[
                        { value: "update", label: "Update — refresh targets for stocks already tracked, add new ones" },
                        { value: "replace", label: "Replace — this month's sheet becomes the whole watchlist" },
                    ]}
                    value={importMode}
                    onChange={(option) => option && setImportMode(option.value)}
                    hint="Replace clears the current watchlist, including which stocks have already crossed their target."
                />

                {importing && (
                    <p className="text-sm text-tertiary">
                        Matching each stock against Yahoo Finance — a full sheet of a few hundred stocks can take
                        several minutes. This screen will update itself when it's done; no need to keep it open.
                    </p>
                )}
            </FormModal>

            <FormModal
                isOpen={Boolean(reviewing)}
                onClose={() => setReviewing(null)}
                title="Confirm the matching symbol"
            >
                <div className="rounded-lg bg-secondary px-4 py-3">
                    <p className="text-xs text-tertiary">Scrip name from the sheet</p>
                    <p className="text-sm text-primary">{reviewing?.scripName}</p>
                </div>

                <Field
                    label="Search NSE equities"
                    name="mappingQuery"
                    value={mappingQuery}
                    onChange={(event) => setMappingQuery(event.target.value)}
                    placeholder="Type a company name..."
                    hint={mappingSearching ? "Searching..." : "Results come straight from Yahoo Finance."}
                />

                <div className="flex flex-col gap-2">
                    {mappingResults.map((candidate) => (
                        <button
                            key={candidate.symbol}
                            type="button"
                            disabled={mappingSaving}
                            onClick={() => pickMapping(candidate)}
                            className="flex items-center justify-between rounded-lg border border-secondary px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-50"
                        >
                            <span>
                                <span className="font-medium text-primary">{candidate.symbol}</span>{" "}
                                <span className="text-tertiary">{candidate.longName}</span>
                            </span>
                            <Check className="size-4 text-quaternary" />
                        </button>
                    ))}
                    {!mappingSearching && mappingQuery.trim().length >= 2 && mappingResults.length === 0 && (
                        <p className="text-sm text-quaternary">No NSE equities matched that search.</p>
                    )}
                </div>
            </FormModal>

            <FormModal
                isOpen={Boolean(editing)}
                onClose={() => setEditing(null)}
                title="Edit tracked stock"
                footer={
                    <FormFooter
                        onCancel={() => setEditing(null)}
                        onSubmit={submitEdit}
                        isLoading={editSaving}
                        submitLabel="Save"
                        loadingLabel="Saving..."
                    />
                }
            >
                <Field
                    label="Scrip Name"
                    name="scripName"
                    value={editForm.scripName}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, scripName: event.target.value }))}
                />
                <Field
                    label="Close"
                    name="close"
                    type="number"
                    value={editForm.close}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, close: event.target.value }))}
                />
                <Field
                    label="Target (Likely Trading High)"
                    name="target"
                    type="number"
                    value={editForm.target}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, target: event.target.value }))}
                />
                <Button
                    color="secondary"
                    onClick={() => {
                        const row = editing;
                        setEditing(null);
                        openReview(row);
                    }}
                >
                    Change matched symbol...
                </Button>
            </FormModal>

            <ConfirmModal
                isOpen={Boolean(removing)}
                onClose={() => {
                    setRemoving(null);
                    setRemoveError(null);
                }}
                onConfirm={confirmDelete}
                isLoading={isDeleting}
                title="Remove this stock?"
                description={
                    removeError ||
                    `${removing?.scripName ?? "This stock"} will stop being tracked. This can't be undone from here.`
                }
                confirmLabel={removeError ? "OK" : "Remove"}
            />

            <ConfirmModal
                isOpen={Boolean(deletingWatchlist)}
                onClose={() => setDeletingWatchlist(null)}
                onConfirm={confirmDeleteWatchlist}
                isLoading={watchlistDeleting}
                title={`Delete "${deletingWatchlist?.name ?? ""}"?`}
                description="This deletes the whole watchlist — every stock in it and all of its alert history. This can't be undone from here."
                confirmLabel="Delete everything"
            />

            <FormModal
                isOpen={addOpen}
                onClose={() => {
                    setAddOpen(false);
                    setAddDuplicate(null);
                }}
                title="Add a stock"
                footer={
                    !addDuplicate && (
                        <FormFooter
                            onCancel={() => setAddOpen(false)}
                            onSubmit={() => submitAdd(undefined)}
                            isLoading={addSaving}
                            submitLabel="Add"
                            loadingLabel="Adding..."
                        />
                    )
                }
            >
                <Field
                    label="Scrip Name"
                    name="addScripName"
                    value={addForm.scripName}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, scripName: event.target.value }))}
                    placeholder="e.g. Reliance Industries Limited"
                    isDisabled={Boolean(addDuplicate)}
                />
                <Field
                    label="Close"
                    name="addClose"
                    type="number"
                    value={addForm.close}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, close: event.target.value }))}
                    isDisabled={Boolean(addDuplicate)}
                />
                <Field
                    label="Target (Likely Trading High)"
                    name="addTarget"
                    type="number"
                    value={addForm.target}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, target: event.target.value }))}
                    isDisabled={Boolean(addDuplicate)}
                />

                {addDuplicate && (
                    <div className="flex flex-col gap-3 rounded-lg bg-secondary px-4 py-3">
                        <p className="text-sm text-secondary">
                            <span className="font-medium text-primary">{addDuplicate.scripName}</span> is already
                            tracked (Close {addDuplicate.close}, Target {addDuplicate.target}). What would you like
                            to do?
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" isDisabled={addSaving} onClick={() => submitAdd("replace")}>
                                Replace the existing entry
                            </Button>
                            <Button size="sm" color="secondary" isDisabled={addSaving} onClick={() => submitAdd("duplicate")}>
                                Add as a separate entry
                            </Button>
                            <Button size="sm" color="tertiary" isDisabled={addSaving} onClick={() => setAddDuplicate(null)}>
                                Go back
                            </Button>
                        </div>
                    </div>
                )}
            </FormModal>

            <FormModal
                isOpen={newWatchlistOpen}
                onClose={() => setNewWatchlistOpen(false)}
                title="New watchlist"
                footer={
                    <FormFooter
                        onCancel={() => setNewWatchlistOpen(false)}
                        onSubmit={submitNewWatchlist}
                        isLoading={newWatchlistSaving}
                        submitLabel="Create"
                        loadingLabel="Creating..."
                    />
                }
            >
                <Field
                    label="Name"
                    name="newWatchlistName"
                    value={newWatchlistName}
                    onChange={(event) => setNewWatchlistName(event.target.value)}
                    placeholder="e.g. Long-term Picks"
                    hint="Its own imports, its own matched symbols reuse the same shared lookup as every other watchlist."
                />
            </FormModal>

            <FormModal
                isOpen={Boolean(renamingWatchlist)}
                onClose={() => setRenamingWatchlist(null)}
                title="Rename watchlist"
                footer={
                    <FormFooter
                        onCancel={() => setRenamingWatchlist(null)}
                        onSubmit={submitRenameWatchlist}
                        isLoading={renameSaving}
                        submitLabel="Save"
                        loadingLabel="Saving..."
                    />
                }
            >
                <Field
                    label="Name"
                    name="renameWatchlistName"
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                />
            </FormModal>
        </>
    );
};

export default Watchlist;
