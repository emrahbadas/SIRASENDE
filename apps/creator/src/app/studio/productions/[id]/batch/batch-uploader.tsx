"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { confirmSplit, markSplitUploaded, refreshSplitJob, startSplitUpload } from "../../split-actions";
import { MIN_SEGMENT_SECONDS, suggestCuts } from "@/lib/video/cuts";
import { audioEnergy, MAX_ANALYSIS_BYTES, type AudioEnergy } from "@/lib/video/energy";
import { isLandscape, probeVideo } from "@/lib/video/probe";

const POLL_MS = 5000;
// Cloudflare requires tus chunks to be a multiple of 256 KiB (min 5 MiB)
const CHUNK_SIZE = 50 * 1024 * 1024;

type Status = "waiting" | "uploading" | "processing" | "splitting" | "done" | "failed";

interface Item {
  key: string;
  file: File;
  title: string;
  duration: number;
  landscape: boolean;
  status: Status;
  pct: number;
  episodes?: number;
  error?: string;
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

/** "superman_1941_512kb.mp4" → "superman 1941 512kb" */
const titleFromName = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

const statusText: Record<Status, string> = {
  waiting: "Sırada",
  uploading: "Yükleniyor",
  processing: "Video işleniyor",
  splitting: "Bölümler oluşturuluyor",
  done: "Eklendi",
  failed: "Hata",
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BatchUploader({
  seasonId,
  productionId,
  maxEpisodeSeconds,
  targetSeconds,
  maxSourceSeconds,
}: {
  seasonId: string;
  productionId: string;
  maxEpisodeSeconds: number;
  targetSeconds: number;
  maxSourceSeconds: number;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<"select" | "running" | "finished">("select");
  const [notice, setNotice] = useState<string | null>(null);
  const uploads = useRef<tus.Upload[]>([]);

  // Leaving the page would abort the uploads
  useEffect(() => {
    if (phase !== "running") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  useEffect(
    () => () => {
      for (const u of uploads.current) void u.abort().catch(() => undefined);
    },
    []
  );

  const patch = (key: string, p: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));

  async function addFiles(files: FileList) {
    setNotice(null);
    const skipped: string[] = [];
    const added: Item[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/")) {
        skipped.push(`${file.name} (video değil)`);
        continue;
      }
      try {
        const probe = await probeVideo(file);
        if (probe.duration < MIN_SEGMENT_SECONDS) {
          skipped.push(`${file.name} (çok kısa)`);
        } else if (probe.duration > maxSourceSeconds) {
          skipped.push(`${file.name} (${Math.floor(maxSourceSeconds / 60)} dakikadan uzun)`);
        } else {
          added.push({
            key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
            file,
            title: titleFromName(file.name),
            duration: probe.duration,
            landscape: isLandscape(probe),
            status: "waiting",
            pct: 0,
          });
        }
      } catch {
        skipped.push(`${file.name} (okunamadı)`);
      }
    }
    added.sort((a, b) => a.file.name.localeCompare(b.file.name, "tr", { numeric: true }));
    setItems((list) => [...list, ...added]);
    if (skipped.length) setNotice(`Eklenmedi: ${skipped.join(", ")}`);
  }

  function move(index: number, delta: number) {
    setItems((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function upload(item: Item, jobId: string) {
    return new Promise<void>((resolve, reject) => {
      const up = new tus.Upload(item.file, {
        endpoint: `/api/stream/split-upload?job=${jobId}`,
        chunkSize: CHUNK_SIZE,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        storeFingerprintForResuming: false,
        metadata: { filename: item.file.name, filetype: item.file.type },
        onProgress: (sent, total) => patch(item.key, { pct: Math.round((sent / total) * 100) }),
        onError: (err) => reject(new Error(`Yükleme başarısız: ${err.message}`)),
        onSuccess: () => resolve(),
      });
      uploads.current.push(up);
      up.start();
    });
  }

  /**
   * Uploads run one after another; meanwhile finished uploads are processed by
   * the provider and turned into episodes strictly in list order, so episode
   * numbers follow the list.
   */
  async function run() {
    const queue = items.filter((it) => it.status === "waiting");
    if (!queue.length) return;
    setPhase("running");

    const jobs = queue.map(() => deferred<string | null>());
    const energies = queue.map(() => deferred<AudioEnergy | null>());

    const uploadLoop = async () => {
      for (const [i, item] of queue.entries()) {
        // Pause analysis runs alongside this file's upload
        if (item.file.size <= MAX_ANALYSIS_BYTES) {
          audioEnergy(item.file).then(energies[i]!.resolve, () => energies[i]!.resolve(null));
        } else {
          energies[i]!.resolve(null);
        }

        patch(item.key, { status: "uploading", pct: 0 });
        const start = await startSplitUpload({
          seasonId,
          durationSeconds: item.duration,
          fileSize: item.file.size,
          batch: true,
        });
        if (!start.ok) {
          patch(item.key, { status: "failed", error: start.error });
          jobs[i]!.resolve(null);
          continue;
        }
        try {
          await upload(item, start.jobId);
          await markSplitUploaded(start.jobId);
          patch(item.key, { status: "processing" });
          jobs[i]!.resolve(start.jobId);
        } catch (e) {
          patch(item.key, { status: "failed", error: (e as Error).message });
          jobs[i]!.resolve(null);
        }
      }
    };

    const confirmLoop = async () => {
      for (const [i, item] of queue.entries()) {
        const jobId = await jobs[i]!.promise;
        if (!jobId) continue;

        // Wait for the provider to finish the source
        let duration: number | null = null;
        let errors = 0;
        for (;;) {
          const res = await refreshSplitJob(jobId);
          if (!res.ok && ++errors >= 12) {
            patch(item.key, { status: "failed", error: `${res.error} — yapım sayfasından "Devam et" ile tamamlayabilirsin` });
            break;
          }
          if (res.ok) errors = 0;
          if (res.ok && res.job.status === "ready") {
            duration = res.job.durationSeconds;
            break;
          }
          if (res.ok && res.job.status === "failed") {
            patch(item.key, { status: "failed", error: res.job.errorMessage ?? "Video işlenemedi" });
            break;
          }
          await sleep(POLL_MS);
        }
        if (!duration) continue;

        patch(item.key, { status: "splitting" });
        const energy = await energies[i]!.promise;
        const cuts = duration > maxEpisodeSeconds ? suggestCuts(duration, targetSeconds, maxEpisodeSeconds, energy ?? undefined) : [];
        const res = await confirmSplit(jobId, cuts, item.title);
        if (res.ok) patch(item.key, { status: "done", episodes: res.episodes });
        else patch(item.key, { status: "failed", error: res.error });
      }
    };

    await Promise.all([uploadLoop(), confirmLoop()]);
    setPhase("finished");
  }

  const totalEpisodes = items.reduce((n, it) => n + (it.episodes ?? 0), 0);
  const estimate = (d: number) => (d > maxEpisodeSeconds ? Math.ceil(d / targetSeconds) : 1);
  const plannedEpisodes = items.filter((it) => it.status === "waiting").reduce((n, it) => n + estimate(it.duration), 0);
  const failed = items.filter((it) => it.status === "failed").length;

  return (
    <div className="space-y-6">
      {phase === "select" && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-700 p-10 text-center transition hover:border-orange-600">
          <span className="font-medium">{items.length ? "Başka video ekle" : "Videoları seç"}</span>
          <span className="text-sm text-zinc-500">
            Birden fazla dosya seçebilirsin (Ctrl/Shift ile). Her biri en fazla {Math.floor(maxSourceSeconds / 60)} dakika.
          </span>
          <input
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {notice && (
        <p className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-sm text-amber-300">{notice}</p>
      )}

      {items.length > 0 && (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li
              key={it.key}
              className={`rounded-xl border px-4 py-3 ${
                it.status === "failed"
                  ? "border-rose-900 bg-rose-950/20"
                  : it.status === "done"
                    ? "border-emerald-900/70 bg-emerald-950/10"
                    : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-6 text-center font-mono text-sm text-zinc-500">{i + 1}</span>
                {phase === "select" ? (
                  <input
                    value={it.title}
                    onChange={(e) => patch(it.key, { title: e.target.value.slice(0, 100) })}
                    placeholder="Bölüm başlığı"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm outline-none focus:border-orange-500"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate font-medium">{it.title}</span>
                )}
                <span className="text-xs text-zinc-500">
                  {fmt(it.duration)} · {it.episodes ?? estimate(it.duration)} bölüm
                  {it.landscape && <span className="ml-1 text-amber-400">· yatay</span>}
                </span>
                {phase === "select" ? (
                  <span className="flex gap-1 text-xs">
                    <button type="button" onClick={() => move(i, -1)} className="rounded border border-zinc-800 px-1.5 py-0.5 hover:border-zinc-600">
                      ↑
                    </button>
                    <button type="button" onClick={() => move(i, 1)} className="rounded border border-zinc-800 px-1.5 py-0.5 hover:border-zinc-600">
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))}
                      className="rounded border border-zinc-800 px-1.5 py-0.5 hover:border-rose-800 hover:text-rose-400"
                    >
                      Kaldır
                    </button>
                  </span>
                ) : (
                  <span
                    className={`text-xs ${
                      it.status === "failed" ? "text-rose-400" : it.status === "done" ? "text-emerald-400" : "text-sky-300"
                    }`}
                  >
                    {statusText[it.status]}
                    {it.status === "uploading" && ` %${it.pct}`}
                  </span>
                )}
              </div>
              {it.status === "uploading" && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full bg-orange-600 transition-all" style={{ width: `${it.pct}%` }} />
                </div>
              )}
              {it.error && <p className="mt-2 text-xs text-rose-300">{it.error}</p>}
            </li>
          ))}
        </ol>
      )}

      {phase === "select" && items.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-zinc-500">
            Yaklaşık {plannedEpisodes} bölüm oluşacak. Başlıklar &quot;Başlık (1/3)&quot; gibi numaralanır; kesimler
            konuşmadaki duraklamalara yerleştirilir. Yükleme bitene kadar bu sayfayı kapatma.
          </p>
          <button
            type="button"
            onClick={run}
            className="shrink-0 rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium transition hover:bg-orange-500"
          >
            {items.length} videoyu yükle
          </button>
        </div>
      )}

      {phase === "running" && (
        <p className="rounded-lg border border-sky-900/60 bg-sky-950/20 p-3 text-sm text-sky-200">
          Videolar sırayla yükleniyor ve bölümlere ayrılıyor. Bitene kadar bu sayfayı açık tut.
        </p>
      )}

      {phase === "finished" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
          <p className="font-medium">
            {totalEpisodes} bölüm eklendi{failed ? ` · ${failed} video eklenemedi` : ""}.
          </p>
          <p className="mt-1 text-zinc-400">
            Bölüm videoları birkaç dakika içinde hazır olur. Yapım sayfasından kontrol edip onaya gönderebilirsin.
          </p>
          <div className="mt-3 flex gap-3">
            <Link
              href={`/studio/productions/${productionId}`}
              className="rounded-lg bg-orange-600 px-4 py-2 font-medium transition hover:bg-orange-500"
            >
              Yapıma dön
            </Link>
            <button
              type="button"
              onClick={() => {
                setItems([]);
                setPhase("select");
              }}
              className="rounded-lg border border-zinc-700 px-4 py-2 transition hover:border-zinc-500"
            >
              Başka videolar yükle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
