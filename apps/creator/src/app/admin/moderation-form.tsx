import { approveSeries, rejectSeries, requestChanges } from "./actions";

export function ModerationForm({ seriesId, returnTo = "/admin" }: { seriesId: string; returnTo?: string }) {
  return (
    <form className="space-y-3" action={approveSeries}>
      <input type="hidden" name="series_id" value={seriesId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <textarea
        name="note"
        rows={2}
        placeholder="Red / düzeltme notu — creator bu notu görecek (onayda boş bırakılabilir)"
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-rose-500"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500"
        >
          Onayla
        </button>
        <button
          type="submit"
          formAction={requestChanges}
          className="rounded-lg border border-sky-800 px-4 py-2 text-sm text-sky-400 transition hover:bg-sky-950"
        >
          Düzeltme iste
        </button>
        <button
          type="submit"
          formAction={rejectSeries}
          className="rounded-lg border border-rose-800 px-4 py-2 text-sm text-rose-400 transition hover:bg-rose-950"
        >
          Reddet
        </button>
      </div>
    </form>
  );
}
