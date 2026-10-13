"use client";

import { useEffect, useState } from "react";

/**
 * Submit button for destructive server actions with an inline two-step
 * confirmation: the first click arms it (showing the warning), the second
 * submits. Does not rely on window.confirm, which embedded browsers and some
 * webviews suppress (it silently returns false there).
 */
export function ConfirmSubmit({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);

  // Disarm after a few seconds so a stray later click cannot submit
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="submit"
        title={message}
        className={armed ? `${className ?? ""} !border-rose-500 !bg-rose-600 !text-white` : className}
        onClick={(e) => {
          if (!armed) {
            e.preventDefault();
            setArmed(true);
          }
        }}
      >
        {armed ? "Emin misin? Tekrar bas" : children}
      </button>
      {armed && <span className="max-w-xs text-[11px] leading-snug text-rose-300">{message}</span>}
    </span>
  );
}
