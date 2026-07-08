import type { InputHTMLAttributes } from "react";

// Shared tonal input used across the auth screens.
export function Field({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-dim">
      {label}
      <input
        className={`rounded-md border border-line bg-inset px-3 py-2.5 text-base text-fg focus:border-accent/60 focus:outline-2 focus:outline-accent/50 ${className}`}
        {...props}
      />
    </label>
  );
}

export function AuthError({ children }: { children: string }) {
  return <p className="m-0 text-[13.5px] text-danger">{children}</p>;
}
