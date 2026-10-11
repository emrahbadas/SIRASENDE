"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { removePoster, uploadPoster } from "../poster-actions";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function PosterEditor({
  seriesId,
  title,
  posterUrl,
  autoCoverUrl,
  editable,
}: {
  seriesId: string;
  title: string;
  posterUrl: string | null;
  /** Frame from the first episode, shown when there is no uploaded poster. */
  autoCoverUrl: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = preview ?? posterUrl ?? autoCoverUrl;

  async function onFile(file: File) {
    setError(null);
    if (!TYPES.includes(file.type)) return setError("JPG, PNG veya WebP seç");
    if (file.size > MAX_BYTES) return setError("En fazla 5 MB");

    const local = URL.createObjectURL(file);
    setPreview(local);
    setBusy(true);
    const form = new FormData();
    form.append("series_id", seriesId);
    form.append("poster", file);
    const res = await uploadPoster(form);
    setBusy(false);
    if (!res.ok) {
      setPreview(null);
      setError(res.error);
    }
    URL.revokeObjectURL(local);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function onRemove() {
    if (!confirm("Poster kaldırılsın mı?")) return;
    setBusy(true);
    const res = await removePoster(seriesId);
    setBusy(false);
    if (!res.ok) setError(res.error);
    router.refresh();
  }

  return (
    <div className="w-32 shrink-0 space-y-2">
      <button
        type="button"
        disabled={!editable || busy}
        onClick={() => inputRef.current?.click()}
        className="group relative flex aspect-9/13 w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-linear-to-br from-zinc-900 to-zinc-950 disabled:cursor-default"
        title={editable ? "Poster yükle" : undefined}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={title} className={`h-full w-full object-cover ${busy ? "opacity-50" : ""}`} />
        ) : (
          <span className="px-2 text-center text-xs text-zinc-600">
            {editable ? "+ Poster yükle" : "Poster yok"}
          </span>
        )}
        {editable && shown && !busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white opacity-0 transition group-hover:opacity-100">
            Değiştir
          </span>
        )}
        {busy && <span className="absolute text-xs text-white">Yükleniyor…</span>}
      </button>

      {!posterUrl && autoCoverUrl && (
        <p className="text-[11px] leading-tight text-zinc-500">Otomatik kapak: 1. bölümden bir kare</p>
      )}
      {editable && posterUrl && (
        <button type="button" onClick={onRemove} disabled={busy} className="text-[11px] text-zinc-500 hover:text-rose-400">
          Posteri kaldır
        </button>
      )}
      {error && <p className="text-[11px] text-rose-400">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={TYPES.join(",")}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  );
}
