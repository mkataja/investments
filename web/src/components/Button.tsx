import { Link, type LinkProps } from "react-router-dom";

import { classNames } from "../lib/css";

export function Button({
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={classNames("button-basic", className)}
      {...props}
    />
  );
}

export function ButtonLink({ className, ...props }: LinkProps) {
  return <Link className={classNames("button-basic", className)} {...props} />;
}
