"use client";

import Link from "next/link";
import { useRef, useState } from "react";

const LONG_PRESS_MS = 350;

/**
 * Vitrine card: poster (or a frame from the first episode), with a short
 * silent preview on hover — or on long-press on touch screens.
 */
export function SeriesCard({
  href,
  title,
  poster,
  preview,
  children,
}: {
  href: string;
  title: string;
  poster: string | null;
  preview: string | null;
  children: React.ReactNode;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const start = () => preview && setPreviewing(true);
  const stop = () => setPreviewing(false);

  return (
    <Link
      href={href}
      onMouseEnter={start}
      onMouseLeave={stop}
      onTouchStart={() => {
        longPressed.current = false;
        pressTimer.current = setTimeout(() => {
          longPressed.current = true;
          start();
        }, LONG_PRESS_MS);
      }}
      onTouchEnd={() => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        stop();
      }}
      onTouchMove={() => pressTimer.current && clearTimeout(pressTimer.current)}
      onClick={(e) => {
        // Releasing a long-press only ends the preview; it does not open the series
        if (longPressed.current) {
          e.preventDefault();
          longPressed.current = false;
        }
      }}
      onContextMenu={(e) => preview && e.preventDefault()}
      className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 transition select-none [-webkit-touch-callout:none] hover:border-rose-500/50"
    >
      <div className="relative flex aspect-9/13 items-center justify-center bg-linear-to-br from-zinc-900 to-zinc-950">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="px-4 text-center text-lg font-bold text-zinc-700 transition group-hover:text-rose-500/70">
            {title}
          </span>
        )}

        {/* The preview is only requested once the viewer shows interest */}
        {preview && previewing && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            onLoad={() => setPreviewLoaded(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              previewLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
        {preview && !previewing && (
          <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-zinc-300 opacity-0 transition group-hover:opacity-100">
            ▶ önizleme
          </span>
        )}
      </div>
      {children}
    </Link>
  );
}
