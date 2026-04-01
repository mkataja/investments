import type { ChangeEvent, Ref } from "react";

export function FileBrowseButton({
  id,
  name = "file",
  accept,
  ariaLabel,
  file,
  inputRef,
  onChange,
}: {
  id: string;
  name?: string;
  accept?: string;
  ariaLabel: string;
  file: File | null;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        aria-label={ariaLabel}
        className="sr-only"
        onChange={onChange}
      />
      <label
        htmlFor={id}
        className="button-basic inline-flex shrink-0 cursor-pointer"
      >
        Browse…
      </label>
      <span
        className="min-w-0 flex-1 truncate text-sm text-slate-600"
        title={file?.name ?? undefined}
      >
        {file?.name ?? "No file chosen"}
      </span>
    </div>
  );
}
