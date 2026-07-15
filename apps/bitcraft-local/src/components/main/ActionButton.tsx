import React from "react";

export type ActionButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pending: boolean;
  pendingLabel: string;
};

export function ActionButton({ pending, pendingLabel, disabled, children, className = "", type = "button", ...props }: ActionButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`${className}${pending ? " is-loading" : ""}`}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
