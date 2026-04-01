import type { ReactNode } from "react";

import { classNames } from "../lib/css";

type ErrorAlertProps = {
  children: ReactNode;
  className?: string;
};

export function ErrorAlert({ children, className }: ErrorAlertProps) {
  return (
    <div role="alert" className={classNames("error-alert", className)}>
      {children}
    </div>
  );
}
