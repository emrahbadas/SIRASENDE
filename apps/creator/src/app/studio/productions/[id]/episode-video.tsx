"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  completeEpisodeUpload,
  refreshEpisodeVideo,
  removeEpisodeVideo,
  startEpisodeUpload,
} from "../video-actions";
import { isLandscape, LANDSCAPE_HINT, probeVideo } from "@/lib/video/probe";

export interface EpisodeAsset {
  id: string;
  status: string;
  duration_seconds: number | null;
  error_message: string | null;
}

const MAX_BYTES = 200 * 1024 * 1024;
const POLL_MS = 5000;

function uploadFile(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Yükleme başarısız (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Bağlantı hatası, tekrar dene"));
    xhr.open("POST", url);
    xhr.send(form);
  });
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function EpisodeVideo({
  episodeId,
  asset,
  editable,
  maxEpisodeSeconds,
  splitHref,
}: {
  episodeId: string;
  asset: EpisodeAsset | null;
  editable: boolean;
  maxEpisodeSeconds: number;
  splitHref: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [landscape, setLandscape] = useState(false);

  const status = asset?.status;
  const processing = status === "processing" || status === "pending_upload";

  // Poll the provider while the video is being encoded
  useEffect(() => {
    if (!asset || !processing || progress !== null) return;
    const timer = setInterval(async () => {
      const res = await refreshEpisodeVideo(asset.id);
      if (res.ok && res.status !== asset.status) router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [asset, processing, progress, router]);

  async function onFile(file: File) {
    setError(null);
    setTooLong(false);
    setLandscape(false);
    if (!file.type.startsWith("video/")) return setError("Lütfen bir video dosyası seç");

    setBusy(true);
    try {
      const probe = await probeVideo(file);
      const duration = probe.duration;
      // Allowed, but the viewer app letterboxes it: tell the creator up front
      setLandscape(isLandscape(probe));
      // Long videos go through the split flow instead of failing here
      if (duration > maxEpisodeSeconds) {
        setTooLong(true);
        return;
      }
      if (file.size > MAX_BYTES) throw new Error("Video en fazla 200 MB olabilir");
      const start = await startEpisodeUpload({
        episodeId,
        durationSeconds: duration,
        fileSize: file.size,
      });
      if (!start.ok) throw new Error(start.error);

      setProgress(0);
      await uploadFile(start.uploadURL, file, setProgress);
      const done = await completeEpisodeUpload(start.assetId);
      if (!done.ok) throw new Error(done.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme başarısız");
    } finally {
      setProgress(null);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }

  async function onRemove() {
    if (!asset || !confirm("Bu bölümün videosu silinsin mi?")) return;
    setBusy(true);
    const res = await removeEpisodeVideo(asset.id);
    if (!res.ok) setError(res.error);
    setBusy(false);
    router.refresh();
  }

  const picker = editable && (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:border-rose-600 hover:text-rose-300 disabled:opacity-50"
      >
        {status === "ready" ? "Değiştir" : status === "failed" || !asset ? "Video yükle" : "Yeniden yükle"}
      </button>
    </>
  );

  return (
    <div className="flex items-center gap-2 text-xs">
      {progress !== null ? (
        <span className="flex items-center gap-2 text-amber-400">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
            <span className="block h-full bg-amber-500" style={{ width: `${progress}%` }} />
          </span>
          %{progress}
        </span>
      ) : status === "ready" ? (
        <span className="text-emerald-400">
          Video hazır{asset?.duration_seconds ? ` · ${fmt(asset.duration_seconds)}` : ""}
        </span>
      ) : processing ? (
        <span className="text-amber-400">Video işleniyor…</span>
      ) : status === "failed" ? (
        <span className="text-rose-400" title={asset?.error_message ?? undefined}>
          Video hatası
        </span>
      ) : (
        <span className="text-zinc-600">Video yok</span>
      )}

      {error && <span className="max-w-48 truncate text-rose-400" title={error}>{error}</span>}
      {landscape && (
        <span className="cursor-help text-amber-400" title={LANDSCAPE_HINT}>
          ⚠ Yatay video
        </span>
      )}
      {tooLong && (
        <span className="text-amber-400">
          {Math.floor(maxEpisodeSeconds / 60)} dakikadan uzun.{" "}
          <a href={splitHref} className="underline hover:text-amber-300">
            Bölümlere ayır
          </a>
        </span>
      )}

      {picker}
      {editable && asset && status === "ready" && (
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className="rounded-lg border border-zinc-800 px-2 py-1 text-zinc-500 transition hover:border-rose-800 hover:text-rose-400 disabled:opacity-50"
        >
          Videoyu sil
        </button>
      )}
    </div>
  );
}
