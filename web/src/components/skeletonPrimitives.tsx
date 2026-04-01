import Skeleton from "react-loading-skeleton";

const SKELETON_BASE = {
  baseColor: "#e2e8f0",
  highlightColor: "#f1f5f9",
} as const;

export function BlockSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      {...SKELETON_BASE}
      className={className}
      borderRadius={6}
      enableAnimation
    />
  );
}

const FORM_FIELD_KEYS = ["f-sk-1", "f-sk-2", "f-sk-3", "f-sk-4"] as const;

export function FormFieldsCardSkeleton({
  ariaLabel,
  fields = 4,
}: {
  ariaLabel: string;
  fields?: 3 | 4;
}) {
  const keys = FORM_FIELD_KEYS.slice(0, fields);
  return (
    <div
      className="form-stack border border-slate-200 rounded-lg p-4 bg-white"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      {keys.map((rowKey) => (
        <div key={rowKey} className="page-header-stack">
          <BlockSkeleton className="h-3 w-24" />
          <BlockSkeleton className="h-9 w-full max-w-full" />
        </div>
      ))}
    </div>
  );
}
