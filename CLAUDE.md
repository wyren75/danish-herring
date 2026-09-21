# Danish Herring — instructions for Claude Code

`SPEC.md` is the source of truth for what this app does and why. It was
built from it, milestone by milestone; that phase is over. Read the
sections the work touches — section 1 for what the screen is for, section 3
for the data, section 7 for the map and its layers, section 13 for the
layout — rather than all 57 KB for a label change, and read them before
writing code, not after. `DECISIONS.md` records every deviation from the
spec since, newest last, and is the first place to look when the code and
the spec disagree. `PROJECT_CONTEXT.md` and `JOURNAL.md` (both gitignored)
explain why the decisions were made; consult them when a choice seems odd.

## Working rules

The app is built and deployed. Work is now small fixes and enhancements,
not milestones — SPEC.md section 12 is history. The invariants below still
hold: they are what the app is.

- **Batch, don't milestone.** A session is one batch of related small
  changes, given together. Finish the whole batch, then stop and report.
  Do not pick up further work unasked.
- **Do not deviate from the spec silently.** If a better approach exists,
  state the deviation in one sentence and ask before implementing it.
- **Recording a change.** Edit SPEC.md only where it now says something
  *false* — a label, a table row, a sentence describing behaviour that
  changed. The reason goes in DECISIONS.md, dated, newest last. Do not add
  a numbered subsection to section 13 for every fix and do not invent new
  milestone numbers. JOURNAL.md is the owner's working document
  (gitignored); it takes an entry only when asked.
- Every displayed timestamp is UTC and ends in "UTC". Never convert to local.
- Two geometries exist — the **site** polygon and the **box** rectangle.
  SPEC.md section 3.1 says which to use where. If unsure, ask.
- The browser only ever **reads** Supabase. No writes, no auth, no server.
- Secrets live in `.env` (gitignored) and in Vercel. The Supabase
  service_role key must never appear anywhere.
- Keep dependencies minimal: `maplibre-gl`, `@supabase/supabase-js`,
  `recharts`. Ask before adding anything else. There is no test runner;
  adding one is a dependency decision for the owner.
- Plain CSS in one file. No Tailwind, no UI library.
- One commit per batch, named for the batch, e.g. `Layer menu: full sensor
  names, exclusive imagery, tooltip fix`. Commit when asked. **Never push
  unasked** — a push to `main` deploys to production.

## Stack

Vite + React + TypeScript. Deployed to Vercel. Data in Supabase, read with
the anon key. Imagery from Sentinel Hub WMS on the Copernicus Data Space
Ecosystem.

## Environment variables

See `.env.example`. All five are required from M0 onward.

## What "done" looks like

SPEC.md section 1 still describes the screen. If the work does not move
toward it, stop and ask. For a batch of small changes, done means all four:

1. `npm run build` passes (it runs `tsc -b` first) and `npm run lint` adds
   no new warnings.
2. SPEC.md no longer says anything false, and DECISIONS.md records why.
3. The owner has run the smoke check below. Claude cannot see the screen:
   never report a visual result that has not been shown to it — say what
   was verified and what was not.
4. The owner has asked for the commit.

**Smoke check** — about a minute on `npm run dev`, before any push:

- Step two scenes with ◀ ▶: the radar image changes and the counts follow.
- Tick each layer in turn — radar, optical (on a scene that offers it), AIS,
  GFW. Radar and optical never show together.
- Click a bright dot inside the orange line: the inspector opens with a
  verdict, and the radius slider moves it.
- Open the scene dropdown and pick a scene from it.
- Open the Observation tab: both sites draw and the N-day slider responds.

Anything touching the verdict, scene selection or the unseen-probability
maths goes to a branch and a Vercel preview URL first, not straight to
`main`.
