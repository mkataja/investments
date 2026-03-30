import type { ReactNode } from "react";

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

/** Shared styles for error messages (banners and inline alerts). */
const errorAlertClassName =
  "rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600";

type ErrorAlertProps = {
  children: ReactNode;
  className?: string;
};

export function ErrorAlert({ children, className }: ErrorAlertProps) {
  return (
    <div role="alert" className={cn(errorAlertClassName, className)}>
      {children}
    </div>
  );
}
