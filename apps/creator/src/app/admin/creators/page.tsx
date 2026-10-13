import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { banCreator, unbanCreator } from "../actions";

type Creator = {
  id: string;
  creator_name: string;
  created_at: string;
  banned_at: string | null;
  ban_reason: string | null;
  productions: { deleted_at: string | null; series: { status: string; deleted_at: string | null }[] }[];
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminCreatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string; banned?: string }>;
}) {
  const { error, q, banned } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roles } = await supabase.from("user_roles").select("role").eq("profile_id", user.id).eq("role", "admin");
  if (!roles?.length) redirect("/admin");

  // Ban reasons are hidden from API roles; read with the service role after the admin check
  let query = createAdminClient()
    .from("creator_profiles")
    .select("id, creator_name, created_at, banned_at, ban_reason, productions(deleted_at, series(status, deleted_at))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (q?.trim()) query = query.ilike("creator_name", `%${q.trim()}%`);
  if (banned) query = query.not("banned_at", "is", null);
  const { data } = await query;
  const creators = (data ?? []) as Creator[];

  const returnTo = `/admin/creators${banned ? "?banned=1" : q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Creator&apos;lar</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Ban: creator&apos;ın yayındaki, durdurulmuş ve incelemedeki dizileri platform tarafından durdurulur; Studio&apos;ya
        erişemez ve ödeme talep edemez. Birikmiş kazancı silinmez. Ban açılınca diziler önceki durumlarına döner.
      </p>

      <form className="mt-6 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Creator adı ara"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-orange-500"
        />
        <button className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500">Ara</button>
        <Link
          href={banned ? "/admin/creators" : "/admin/creators?banned=1"}
          className={`rounded-lg border px-4 py-2 text-sm ${
            banned ? "border-rose-700 bg-rose-950/40 text-rose-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
          }`}
        >
          Yalnızca banlılar
        </Link>
      </form>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}

      {!creators.length ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">Creator bulunamadı.</div>
      ) : (
        <ul className="mt-6 space-y-3">
          {creators.map((c) => {
            const series = c.productions.filter((p) => !p.deleted_at).flatMap((p) => p.series.filter((s) => !s.deleted_at));
            const live = series.filter((s) => s.status === "published").length;
            return (
              <li
                key={c.id}
                className={`rounded-xl border p-4 ${c.banned_at ? "border-rose-900/70 bg-rose-950/20" : "border-zinc-800 bg-zinc-900/50"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {c.creator_name}
                      {c.banned_at && (
                        <span className="rounded-full border border-rose-700 px-2 py-0.5 text-xs font-normal text-rose-300">
                          Banlı · {fmt(c.banned_at)}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {series.length} dizi ({live} yayında) · katılım {fmt(c.created_at)}
                    </p>
                    {c.ban_reason && <p className="mt-1 text-xs text-rose-300/80">Sebep: {c.ban_reason}</p>}
                  </div>

                  {c.banned_at ? (
                    <form action={unbanCreator}>
                      <input type="hidden" name="creator_id" value={c.id} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <ConfirmSubmit
                        message="Ban açılsın mı? Ban sırasında durdurulan diziler önceki durumlarına döner."
                        className="rounded-lg border border-emerald-800 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-950"
                      >
                        Banı aç
                      </ConfirmSubmit>
                    </form>
                  ) : (
                    <form action={banCreator} className="flex flex-wrap items-start gap-2">
                      <input type="hidden" name="creator_id" value={c.id} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input
                        name="reason"
                        required
                        minLength={3}
                        placeholder="Ban sebebi (creator görür)"
                        className="w-52 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-rose-500"
                      />
                      <ConfirmSubmit
                        message={`${c.creator_name} banlansın mı? Yayındaki dizileri durdurulur, Studio'ya erişemez.`}
                        className="rounded-lg border border-rose-800 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-950"
                      >
                        Banla
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
