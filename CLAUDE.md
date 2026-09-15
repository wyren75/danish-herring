# Danish Herring — instructions for Claude Code

This repository is built milestone by milestone from `SPEC.md`. Read that
file first, in full, before writing any code. `PROJECT_CONTEXT.md` and
`JOURNAL.md` explain why the decisions in the spec were made; consult them
when a choice seems odd.

## Working rules

- Build **one milestone per session**, in the order given in SPEC.md
  section 12. Do not start the next milestone until the current one's
  "done when" test passes and the owner has confirmed.
- **Do not deviate from the spec silently.** If a better approach exists,
  state the deviation in one sentence and ask before implementing it.
- Every displayed timestamp is UTC and ends in "UTC". Never convert to local.
- Two geometries exist — the **site** polygon and the **box** rectangle.
  SPEC.md section 3.1 says which to use where. If unsure, ask.
- The browser only ever **reads** Supabase. No writes, no auth, no server.
- Secrets live in `.env` (gitignored) and in Vercel. The Supabase
  service_role key must never appear anywhere.
- Keep dependencies minimal: `maplibre-gl`, `@supabase/supabase-js`,
  `recharts`. Ask before adding anything else.
- Plain CSS in one file. No Tailwind, no UI library.
- Commit after each milestone with a message naming it, e.g. `M3: Sentinel-1
  layer pinned to scene window`.

## Stack

Vite + React + TypeScript. Deployed to Vercel. Data in Supabase, read with
the anon key. Imagery from Sentinel Hub WMS on the Copernicus Data Space
Ecosystem.

## Environment variables

See `.env.example`. All five are required from M0 onward.

## What "done" looks like

SPEC.md section 1. If the current work does not move toward that screen,
stop and ask.
