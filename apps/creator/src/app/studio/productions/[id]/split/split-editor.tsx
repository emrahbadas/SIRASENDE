"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import {
  cancelSplitJob,
  confirmSplit,
  markSplitUploaded,
  refreshSplitJob,
  startSplitUpload,
  type SplitJobState,
} from "../../split-actions";
import { MIN_SEGMENT_SECONDS, segmentsFromCuts, suggestCuts, validateCuts } from "@/lib/video/cuts";

// Decoding audio needs the whole file in memory; above this we space cuts evenly
const MAX_ANALYSIS_BYTES = 1.5 * 1024 * 1024 * 1024;
const ENERGY_STEP = 0.1;
const POLL_MS = 5000;
// Cloudflare requires tus chunks to be a multiple of 256 KiB (min 5 MiB)
const CHUNK_SIZE = 50 * 1024 * 1024;

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video dosyası okunamadı"));
    };
    video.src = url;
  });
}

/** RMS energy per ENERGY_STEP seconds, decoded at a low sample rate to save memory. */
async function audioEnergy(file: File) {
  const ctx = new OfflineAudioContext(1, 1, 8000);
  const audio = await ctx.decodeAudioData(await file.arrayBuffer());
  const window = Math.round(audio.sampleRate * ENERGY_STEP);
  const values = new Float32Array(Math.ceil(audio.length / window));
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  for (let w = 0; w < values.length; w++) {
    let sum = 0;
    const end = Math.min(audio.length, (w + 1) * window);
    for (let i = w * window; i < end; i++) {
      let s = 0;
      for (const ch of channels) s += ch[i]!;
      s /= channels.length;
      sum += s * s;
    }
    values[w] = Math.sqrt(sum / Math.max(1, end - w * window));
  }
  return { values, step: ENERGY_STEP };
}

export function SplitEditor({
  seasonId,
  productionId,
  maxEpisodeSeconds,
  targetSeconds,
  resumeJob,
}: {
  seasonId: string;
  productionId: string;
  maxEpisodeSeconds: number;
  targetSeconds: number;
  resumeJob: SplitJobState | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [job, setJob] = useState<SplitJobState | null>(resumeJob);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<"idle" | "running" | "done" | "fallback">("idle");
  const [energy, setEnergy] = useState<{ values: Float32Array; step: number } | null>(null);
  const [cuts, setCuts] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Server-measured duration wins once the source is processed
  const total = job?.durationSeconds ?? (duration ? Math.floor(duration) : null);
  const segments = useMemo(() => (total ? segmentsFromCuts(cuts, total) : []), [cuts, total]);
  const invalid = total ? validateCuts(cuts, total, maxEpisodeSeconds) : null;

  // Keep cuts inside the server-measured duration
  useEffect(() => {
    if (job?.durationSeconds) setCuts((c) => c.filter((x) => x < job.durationSeconds!));
  }, [job?.durationSeconds]);

  // Poll the provider while the source is processing
  const waiting = job && ["pending_upload", "processing"].includes(job.status) && uploadPct === null;
  useEffect(() => {
    if (!job || !waiting) return;
    const timer = setInterval(async () => {
      const res = await refreshSplitJob(job.id);
      if (res.ok) setJob(res.job);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job, waiting]);

  useEffect(
    () => () => {
      void uploadRef.current?.abort().catch(() => undefined);
    },
    []
  );

  async function onFile(file: File) {
    setError(null);
    if (!file.type.startsWith("video/")) return setError("Lütfen bir video dosyası seç");

    let seconds: number;
    try {
      seconds = await readDuration(file);
    } catch (e) {
      return setError((e as Error).message);
    }

    if (resumeJob) {
      const expected = resumeJob.durationSeconds;
      if (expected && Math.abs(expected - seconds) > 2) {
        return setError("Bu, yüklenen videoyla aynı dosya değil. Aynı dosyayı seç.");
      }
    } else if (seconds <= maxEpisodeSeconds) {
      return setError(
        `Bu video ${fmt(seconds)}; zaten tek bölüm uzunluğunda. Bölüm satırındaki "Video yükle"yi kullan.`
      );
    }

    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(URL.createObjectURL(file));
    setDuration(seconds);
    setCuts(suggestCuts(seconds, targetSeconds, maxEpisodeSeconds));

    // Suggest cuts on pauses while the upload runs
    if (file.size <= MAX_ANALYSIS_BYTES) {
      setAnalysis("running");
      audioEnergy(file)
        .then((e) => {
          setEnergy(e);
          setCuts(suggestCuts(seconds, targetSeconds, maxEpisodeSeconds, e));
          setAnalysis("done");
        })
        .catch(() => setAnalysis("fallback"));
    } else {
      setAnalysis("fallback");
    }

    if (!resumeJob) await upload(file, seconds);
  }

  async function upload(file: File, seconds: number) {
    setBusy(true);
    const start = await startSplitUpload({ seasonId, durationSeconds: seconds, fileSize: file.size });
    setBusy(false);
    if (!start.ok) return setError(start.error);

    setJob({ id: start.jobId, status: "pending_upload", durationSeconds: null, errorMessage: null });
    setUploadPct(0);
    const up = new tus.Upload(file, {
      endpoint: `/api/stream/split-upload?job=${start.jobId}`,
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      storeFingerprintForResuming: false,
      metadata: { filename: file.name, filetype: file.type },
      onProgress: (sent, totalBytes) => setUploadPct(Math.round((sent / totalBytes) * 100)),
      onError: (err) => {
        setUploadPct(null);
        setError(`Yükleme başarısız: ${err.message}`);
      },
      onSuccess: async () => {
        setUploadPct(null);
        const res = await markSplitUploaded(start.jobId);
        if (res.ok) setJob(res.job);
      },
    });
    uploadRef.current = up;
    up.start();
  }

  function moveCut(index: number, delta: number) {
    if (!total) return;
    setCuts((c) => {
      const next = [...c].sort((a, b) => a - b);
      const lo = (next[index - 1] ?? 0) + MIN_SEGMENT_SECONDS;
      const hi = (next[index + 1] ?? total) - MIN_SEGMENT_SECONDS;
      next[index] = Math.min(hi, Math.max(lo, next[index]! + delta));
      return next;
    });
  }

  function preview(at: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, at - 3);
    void v.play();
  }

  async function onConfirm() {
    if (!job || invalid) return;
    setBusy(true);
    setError(null);
    const res = await confirmSplit(job.id, cuts);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(`/studio/productions/${res.productionId}`);
  }

  async function onCancel() {
    if (!job || !confirm("Bu bölme işi iptal edilsin mi? Yüklenen video silinir.")) return;
    await uploadRef.current?.abort().catch(() => undefined);
    const res = await cancelSplitJob(job.id);
    if (!res.ok) return setError(res.error);
    router.push(`/studio/productions/${productionId}`);
  }

  const sorted = [...cuts].sort((a, b) => a - b);
  const sourceReady = job?.status === "ready";

  return (
    <div className="space-y-6">
      {!fileUrl && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-700 p-10 text-center transition hover:border-rose-600">
          <span className="font-medium">
            {resumeJob ? "Yüklediğin videoyu tekrar seç" : "Uzun videoyu seç"}
          </span>
          <span className="text-sm text-zinc-500">
            {resumeJob
              ? "Video zaten yüklendi; kesimleri ayarlamak için aynı dosyayı bilgisayarından seç."
              : `Video otomatik olarak en fazla ${Math.floor(maxEpisodeSeconds / 60)} dakikalık bölümlere ayrılır.`}
          </span>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
      )}

      {error && (
        <p className="rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">{error}</p>
      )}

      {fileUrl && total && (
        <>
          <div className="grid gap-6 md:grid-cols-[240px_1fr]">
            <video
              ref={videoRef}
              src={fileUrl}
              controls
              className="aspect-9/16 w-full rounded-xl border border-zinc-800 bg-black"
            />

            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-zinc-400">
                <p>
                  Toplam {fmt(total)} · {segments.length} bölüm
                </p>
                <p className="mt-1">
                  {uploadPct !== null
                    ? `Yükleniyor %${uploadPct}`
                    : job?.status === "processing" || job?.status === "pending_upload"
                      ? "Video işleniyor… kesimleri bu sırada ayarlayabilirsin"
                      : sourceReady
                        ? "Video hazır — kesimleri onaylayabilirsin"
                        : job?.status === "failed"
                          ? `Hata: ${job.errorMessage ?? "video işlenemedi"}`
                          : ""}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {analysis === "running"
                    ? "Sesteki duraklamalar analiz ediliyor…"
                    : analysis === "done"
                      ? "Kesimler konuşmadaki duraklamalara yerleştirildi. Önizleyip kaydırabilirsin."
                      : analysis === "fallback"
                        ? "Ses analiz edilemedi; kesimler eşit aralıklı. Önizleyip ayarla."
                        : ""}
                </p>
              </div>

              <ol className="space-y-2">
                {segments.map((seg, i) => {
                  const len = seg.end - seg.start;
                  const bad = len > maxEpisodeSeconds || len < MIN_SEGMENT_SECONDS;
                  return (
                    <li key={i} className="space-y-2">
                      <div
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                          bad ? "border-rose-800 bg-rose-950/30" : "border-zinc-800 bg-zinc-900/50"
                        }`}
                      >
                        <span>
                          Bölüm {i + 1} · {fmt(seg.start)}–{fmt(seg.end)}{" "}
                          <span className={bad ? "text-rose-400" : "text-zinc-500"}>({fmt(len)})</span>
                        </span>
                        <span className="flex gap-2 text-xs">
                          <button type="button" onClick={() => preview(seg.start + 3)} className="text-zinc-400 hover:text-white">
                            İzle
                          </button>
                          {len >= MIN_SEGMENT_SECONDS * 2 && (
                            <button
                              type="button"
                              onClick={() => setCuts((c) => [...c, seg.start + Math.floor(len / 2)])}
                              className="text-zinc-400 hover:text-white"
                            >
                              Ortadan böl
                            </button>
                          )}
                        </span>
                      </div>

                      {i < sorted.length && (
                        <div className="flex flex-wrap items-center gap-1 pl-3 text-xs text-zinc-400">
                          <span className="mr-1 text-rose-400">✂ {fmt(sorted[i]!)}</span>
                          {[-5, -1, 1, 5].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => moveCut(i, d)}
                              className="rounded border border-zinc-800 px-1.5 py-0.5 hover:border-zinc-600"
                            >
                              {d > 0 ? `+${d}s` : `${d}s`}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => preview(sorted[i]!)}
                            className="rounded border border-zinc-800 px-1.5 py-0.5 hover:border-zinc-600"
                          >
                            Geçişi izle
                          </button>
                          <button
                            type="button"
                            onClick={() => setCuts(sorted.filter((_, k) => k !== i))}
                            className="rounded border border-zinc-800 px-1.5 py-0.5 hover:border-rose-800 hover:text-rose-400"
                          >
                            Kesimi kaldır
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              {energy && (
                <button
                  type="button"
                  onClick={() => setCuts(suggestCuts(total, targetSeconds, maxEpisodeSeconds, energy))}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Önerilen kesimlere dön
                </button>
              )}
            </div>
          </div>

          {invalid && <p className="text-sm text-rose-400">{invalid}</p>}

          <div className="flex items-center justify-between">
            <button type="button" onClick={onCancel} className="text-sm text-zinc-500 hover:text-rose-400">
              İptal et
            </button>
            <button
              type="button"
              disabled={!sourceReady || !!invalid || busy}
              onClick={onConfirm}
              className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-medium transition hover:bg-rose-500 disabled:opacity-40"
            >
              {sourceReady ? `${segments.length} bölüm oluştur` : "Video işleniyor…"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
