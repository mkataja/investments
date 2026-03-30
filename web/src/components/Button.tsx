import { Link, type LinkProps } from "react-router-dom";

function cn(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(" ");
}

/** Primary (outlined emerald) control - shared by `Button` and `ButtonLink`. */
export const buttonPrimaryClassName =
  "inline-flex items-center justify-center text-sm font-medium rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500";

export function Button({
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(buttonPrimaryClassName, className)}
      {...props}
    />
  );
}

export function ButtonLink({ className, ...props }: LinkProps) {
  return <Link className={cn(buttonPrimaryClassName, className)} {...props} />;
}
