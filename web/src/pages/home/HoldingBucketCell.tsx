import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { apiPutJson } from "../../api/client";
import { classNames } from "../../lib/css";
import type { HoldingBucketOption } from "./types";

/** Always offered in the picker; persisted on first use like any other name. */
const PREDEFINED_BUCKET_NAMES = [
  "Cash",
  "Commodities",
  "Core",
  "Satellite",
] as const;

function isPredefinedBucketName(name: string): boolean {
  return (PREDEFINED_BUCKET_NAMES as readonly string[]).includes(name);
}

type BucketDropdownEntry =
  | { key: string; kind: "other" }
  | { key: string; kind: "predefined"; name: string }
  | { key: string; kind: "api"; id: number; name: string }
  | { key: string; kind: "removedHint"; name: string };

function bucketEntryLabel(e: BucketDropdownEntry): string {
  return e.kind === "other" ? "Other" : e.name;
}

function bucketEntryMatchesFilter(
  e: BucketDropdownEntry,
  qLower: string,
): boolean {
  if (qLower.length === 0) {
    return false;
  }
  return bucketEntryLabel(e).toLowerCase().includes(qLower);
}

/** Puts `item` at the top of `list`'s visible viewport; clamps when it is too far down to reach the top. */
function scrollMatchedBucketListItemToTop(
  list: HTMLElement,
  item: HTMLElement,
): void {
  const listRect = list.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const yWithinContent = itemRect.top - listRect.top + list.scrollTop;
  const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
  list.scrollTop = Math.min(Math.max(0, yWithinContent), maxScroll);
}

type HoldingBucketCellProps = {
  portfolioId: number;
  instrumentId: number;
  customBucketName: string | null;
  buckets: HoldingBucketOption[];
  /** Session names no longer in `buckets` but kept for the picker until navigation or a refetch restores the name. */
  removedBucketNameHints?: string[];
  onUpdated: () => void | Promise<void>;
  onRemovedBucketNames?: (names: string[]) => void;
  onError: (message: string | null) => void;
};

function removedNamesFromPutResponse(data: unknown): string[] {
  if (typeof data !== "object" || data === null) {
    return [];
  }
  const rb = (data as { removedBuckets?: unknown }).removedBuckets;
  if (!Array.isArray(rb)) {
    return [];
  }
  return rb.flatMap((x) => {
    if (typeof x !== "object" || x === null) {
      return [];
    }
    const name = (x as { name?: unknown }).name;
    return typeof name === "string" && name.trim().length > 0
      ? [name.trim()]
      : [];
  });
}

export function HoldingBucketCell({
  portfolioId,
  instrumentId,
  customBucketName,
  buckets,
  removedBucketNameHints = [],
  onUpdated,
  onRemovedBucketNames,
  onError,
}: HoldingBucketCellProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const bucketListItemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const selectAllFilterOnFocusRef = useRef(false);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const label = customBucketName ?? "Other";

  const otherBuckets = useMemo(() => {
    const predefined = new Set<string>(PREDEFINED_BUCKET_NAMES);
    return buckets.filter((b) => !predefined.has(b.name));
  }, [buckets]);

  const removedHintsAll = useMemo(() => {
    const predefined = new Set<string>(PREDEFINED_BUCKET_NAMES);
    const inApi = new Set(buckets.map((b) => b.name));
    return removedBucketNameHints.filter(
      (n) => !predefined.has(n) && !inApi.has(n),
    );
  }, [buckets, removedBucketNameHints]);

  const sortedDropdownEntries = useMemo(() => {
    const entries: BucketDropdownEntry[] = [{ key: "other", kind: "other" }];

    for (const name of PREDEFINED_BUCKET_NAMES) {
      entries.push({ key: `predef-${name}`, kind: "predefined", name });
    }

    for (const b of otherBuckets) {
      entries.push({
        key: `api-${b.id}`,
        kind: "api",
        id: b.id,
        name: b.name,
      });
    }

    for (const name of removedHintsAll) {
      entries.push({
        key: `removed-${name}`,
        kind: "removedHint",
        name,
      });
    }

    const labelFor = (e: BucketDropdownEntry) =>
      e.kind === "other" ? "Other" : e.name;

    return [...entries].sort((a, b) =>
      labelFor(a).localeCompare(labelFor(b), undefined, {
        sensitivity: "base",
      }),
    );
  }, [otherBuckets, removedHintsAll]);

  const firstFilterMatchEntryKey = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q.length === 0) {
      return null;
    }
    const hit = sortedDropdownEntries.find((e) =>
      bucketEntryMatchesFilter(e, q),
    );
    return hit?.key ?? null;
  }, [filter, sortedDropdownEntries]);

  const showCreateHint = useMemo(() => {
    const t = filter.trim();
    if (t.length === 0) {
      return false;
    }
    if (isPredefinedBucketName(t)) {
      return false;
    }
    return !buckets.some((b) => b.name === t);
  }, [buckets, filter]);

  const updatePopoverPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const r = anchor.getBoundingClientRect();
    const margin = 4;
    const minPopoverWidth = 12 * 16;
    let left = r.left;
    const maxLeft = window.innerWidth - 8 - minPopoverWidth;
    left = Math.max(8, Math.min(left, maxLeft));
    setPopoverPos({ top: r.bottom + margin, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPos(null);
      return;
    }
    updatePopoverPosition();
  }, [open, updatePopoverPosition]);

  useLayoutEffect(() => {
    if (!open || popoverPos == null || firstFilterMatchEntryKey == null) {
      return;
    }
    const el = bucketListItemRefs.current.get(firstFilterMatchEntryKey);
    if (el == null) {
      return;
    }
    const list = el.closest(".holding-bucket-popover-list");
    if (!(list instanceof HTMLElement)) {
      return;
    }
    scrollMatchedBucketListItemToTop(list, el);
  }, [open, popoverPos, firstFilterMatchEntryKey]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onScrollOrResize = () => {
      updatePopoverPosition();
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePopoverPosition]);

  useEffect(() => {
    if (!open || popoverPos == null) {
      return;
    }
    const el = filterInputRef.current;
    if (el == null) {
      return;
    }
    el.focus();
    if (selectAllFilterOnFocusRef.current) {
      selectAllFilterOnFocusRef.current = false;
      requestAnimationFrame(() => {
        el.select();
      });
    }
  }, [open, popoverPos]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popoverRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      onError(null);
      setSaving(true);
      try {
        const data = await fn();
        const names = removedNamesFromPutResponse(data);
        if (names.length > 0) {
          onRemovedBucketNames?.(names);
        }
        await onUpdated();
        setOpen(false);
        setFilter("");
      } catch (e) {
        onError(String(e));
      } finally {
        setSaving(false);
      }
    },
    [onError, onRemovedBucketNames, onUpdated],
  );

  const clearToOther = useCallback(() => {
    return run(async () =>
      apiPutJson<unknown>("/portfolio/holding-bucket", {
        portfolioId,
        instrumentId,
      }),
    );
  }, [instrumentId, portfolioId, run]);

  const assignById = useCallback(
    (bucketId: number) => {
      return run(async () =>
        apiPutJson<unknown>("/portfolio/holding-bucket", {
          portfolioId,
          instrumentId,
          bucketId,
        }),
      );
    },
    [instrumentId, portfolioId, run],
  );

  const assignByNewName = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length === 0) {
        return clearToOther();
      }
      return run(async () =>
        apiPutJson<unknown>("/portfolio/holding-bucket", {
          portfolioId,
          instrumentId,
          bucketName: trimmed,
        }),
      );
    },
    [clearToOther, instrumentId, portfolioId, run],
  );

  const assignPredefinedOrExistingName = useCallback(
    (name: string) => {
      const found = buckets.find((b) => b.name === name);
      if (found) {
        return void assignById(found.id);
      }
      return void assignByNewName(name);
    },
    [assignById, assignByNewName, buckets],
  );

  const commitFilter = useCallback(() => {
    const t = filter.trim();
    if (t.length === 0) {
      return void clearToOther();
    }
    const exact = buckets.find((b) => b.name === t);
    if (exact) {
      return void assignById(exact.id);
    }
    return void assignByNewName(t);
  }, [assignById, assignByNewName, buckets, clearToOther, filter]);

  const popoverContent =
    open && popoverPos != null ? (
      <div
        ref={popoverRef}
        className="holding-bucket-popover"
        style={{
          top: popoverPos.top,
          left: popoverPos.left,
        }}
      >
        <input
          ref={filterInputRef}
          type="text"
          className="form-control text-sm w-full rounded-none border-0 border-b border-slate-200"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitFilter();
            }
          }}
          placeholder="Filter or new name"
          aria-label="Bucket filter or new name"
        />
        <ul className="holding-bucket-popover-list">
          {sortedDropdownEntries.map((entry) => (
            <li
              key={entry.key}
              ref={(el) => {
                if (el) {
                  bucketListItemRefs.current.set(entry.key, el);
                } else {
                  bucketListItemRefs.current.delete(entry.key);
                }
              }}
            >
              {entry.kind === "other" ? (
                <button
                  type="button"
                  className="holding-bucket-popover-option"
                  disabled={saving}
                  onClick={() => void clearToOther()}
                >
                  Other
                </button>
              ) : null}
              {entry.kind === "predefined" ? (
                <button
                  type="button"
                  className="holding-bucket-popover-option"
                  disabled={saving}
                  onClick={() =>
                    void assignPredefinedOrExistingName(entry.name)
                  }
                >
                  {entry.name}
                </button>
              ) : null}
              {entry.kind === "api" ? (
                <button
                  type="button"
                  className="holding-bucket-popover-option"
                  disabled={saving}
                  onClick={() => void assignById(entry.id)}
                >
                  {entry.name}
                </button>
              ) : null}
              {entry.kind === "removedHint" ? (
                <button
                  type="button"
                  className="holding-bucket-popover-option"
                  disabled={saving}
                  onClick={() => void assignByNewName(entry.name)}
                >
                  {entry.name}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {showCreateHint ? (
          <div className="border-t border-slate-100 px-2 py-1.5 text-xs text-slate-600">
            Enter to use &quot;{filter.trim()}&quot; as a new bucket
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <div ref={anchorRef} className="min-w-0">
      <button
        type="button"
        className={classNames(
          "button-basic w-full max-w-full text-left truncate py-0.5 px-1.5 text-sm",
          saving ? "opacity-60 pointer-events-none" : undefined,
        )}
        disabled={saving}
        onClick={() => {
          setOpen((wasOpen) => {
            if (wasOpen) {
              setFilter("");
              return false;
            }
            selectAllFilterOnFocusRef.current = true;
            setFilter(label);
            return true;
          });
        }}
      >
        {label}
      </button>
      {popoverContent != null
        ? createPortal(popoverContent, document.body)
        : null}
    </div>
  );
}
