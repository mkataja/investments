import { useCallback, useEffect, useRef, useState } from "react";
import { classNames } from "../lib/css";
import { Button } from "./Button";

const COPIED_TOOLTIP_MS = 2000;

function ClipboardCopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <title>Copy</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a3 3 0 0 1-3 3H6.75a3 3 0 0 1-3-3V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 8.25h-9a.75.75 0 0 0-.75.75v10.5c0 .414.336.75.75.75h9a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75Z"
      />
    </svg>
  );
}

type CopyToClipboardButtonProps = {
  text: string;
  className?: string;
};

export function CopyToClipboardButton({
  text,
  className,
}: CopyToClipboardButtonProps) {
  const [showCopied, setShowCopied] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current != null) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    void navigator.clipboard.writeText(text);
    setShowCopied(true);
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setShowCopied(false);
      hideTimerRef.current = null;
    }, COPIED_TOOLTIP_MS);
  }, [text]);

  return (
    <div className="relative inline-flex">
      <Button
        type="button"
        className={classNames("p-2 min-w-0", className)}
        aria-label="Copy to clipboard"
        onClick={handleClick}
      >
        <ClipboardCopyIcon className="w-5 h-5" />
      </Button>
      {showCopied ? (
        <output
          className="absolute bottom-full left-1/2 z-10 mb-1 block -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white shadow-md"
          aria-live="polite"
        >
          Copied!
        </output>
      ) : null}
    </div>
  );
}
