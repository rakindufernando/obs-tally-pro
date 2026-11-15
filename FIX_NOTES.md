# OBS Bridge TypeScript TS2538 fix

The `apps/obs-bridge/src/obs.ts` file has been updated to guard the `sceneName` and
`sourceName` values from OBS WebSocket JSON responses before using them in typed
records or recursive scene traversal.

From the repository root, run:

```powershell
npm.cmd run build -w @tally/shared
npm.cmd run typecheck -w @tally/obs-bridge
npm.cmd run build
npm.cmd test
```

No `.env` or Supabase settings need to change. See `VALIDATION_REPORT.md` for the
project's existing verification limitations. The correction was typechecked against a
representative OBS WebSocket response shim; a full install-based build requires local
dependencies and real OBS acceptance testing.
