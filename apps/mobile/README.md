# Sıra Senin — Mobile (Expo)

Viewer app: home, series page and a vertical, swipeable episode player.

- Expo SDK 57, Expo Router (`src/app`), TypeScript.
- Data: Supabase (auth, coin unlocks, watch progress via RPC) and the creator
  app's `/api/v1` (catalog, series, signed HLS playback). Signing keys never
  ship in the app.

## Run

Create `apps/mobile/.env.local` (public values only):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
# optional: local API for the web preview (phones use production)
EXPO_PUBLIC_WEB_API_URL=http://localhost:3000
```

```bash
pnpm --filter @sirasende/mobile start   # scan the QR code with Expo Go
```

Typecheck and lint: `pnpm --filter @sirasende/mobile typecheck`, `npx expo lint`.
