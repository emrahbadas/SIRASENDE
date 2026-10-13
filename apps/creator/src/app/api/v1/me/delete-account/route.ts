import { callerClient, json, preflight } from "@/lib/api/v1";
import { deleteAccount } from "@/lib/account/delete";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/** Deletes the caller's own account (in-app "Hesabımı sil"). */
export async function POST(request: Request) {
  const { token, supabase } = callerClient(request);
  if (!token) return json({ error: "not_authenticated" }, 401);
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return json({ error: "not_authenticated" }, 401);

  const result = await deleteAccount(data.user.id, token);
  if (!result.ok) return json({ error: "delete_failed", message: result.error }, 409);
  return json({ ok: true });
}
