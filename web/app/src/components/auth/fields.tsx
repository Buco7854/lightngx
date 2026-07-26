import type { InputHTMLAttributes } from "react";
import { AlertTriangleIcon } from "../../icons";

export function Field({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-dim">{label}</span>
      <input
        className={`min-h-[44px] rounded-xl border border-line bg-inset px-3.5 text-[15px] text-fg placeholder:text-faint focus:border-accent/50 focus:outline-2 focus:outline-accent/50 ${className}`}
        {...props}
      />
    </label>
  );
}

export function AuthError({ children }: { children: string }) {
  return (
    <p className="m-0 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-[13.5px] leading-snug text-danger-ink">
      <AlertTriangleIcon size={16} className="mt-px shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
