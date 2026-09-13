# Gambalator guide for coding assistants

This file is the short operational context for LLMs and other coding agents working
on Gambalator. Read it before changing the project. For the full product requirements,
see `PRD.md`; for a Russian explanation of the calculation, see
`CALCULATION_LOGIC_RU.md`; for operator setup, see `README.md` and
`backend/README.md`.

## What the project is

Gambalator is a desktop-only, Russian-language donation round calculator. It keeps an
ordered stream of donations, fills fixed-size RUB rounds (called `Гамбашар` in the UI),
and records the nickname or nicknames with the largest contribution in each completed
round.

The project supports two modes:

1. A static React application for manual entry. It can be hosted on GitHub Pages or
   built as one self-contained HTML file.
2. The same frontend served by a local Python service that reliably imports donations
   from DonationAlerts. The local service is intended to run on Linux and Windows and
   binds to `127.0.0.1:5741` by default.

The project is named **Gambalator**. Do not reintroduce the old `Gambulator` spelling.

## Site version

- The operator-approved site version is defined in `src/version.ts` as `APP_VERSION`
  and displayed beside the Gambalator title. Use the two-part `X.X` format (for
  example, `1.0`). This is separate from package and persistence schema versions.
- Consider whether a version update is appropriate when preparing a release or
  handing off a substantial set of changes. Do not bump it for every change.
- Before changing `APP_VERSION`, ask the operator to approve the proposed version.
  An explicit version instruction in the current task already counts as approval;
  do not ask again. Without approval, keep the current version and continue the work.
## Product conventions

- All visible application copy must be Russian. Code and developer documentation may
  be English.
- The UI is desktop-only and intentionally dark. The main palette is muted pink
  (`#fa75db`), yellow, and orange. Healthy connection states are green. Avoid adding
  visual noise or bright backgrounds without an explicit request.
- The main page order is: header, DonationAlerts integration, donation workspace,
  collapsed calculation settings, footer. Settings are the last main component.
- Manual entry, calculation settings, and consumed-donation `ИСТОРИЯ` start collapsed.
- `История победителей` is separate from consumed-donation `ИСТОРИЯ`. It has a wide
  modal opened by an icon so long or tied winner names can wrap without truncation.
- Active donations are displayed newest-first, but this visual reversal must not
  reverse their calculation order.
- `src/styles.css` contains the shared visual system. Preserve existing spacing,
  colors, and component hierarchy unless the task explicitly changes them.

## Frontend architecture

- `src/App.tsx` loads and refreshes backend-owned state in local mode, retains the
  local reducer for static mode, dispatches calculation actions, owns feedback, and
  controls top-level component order.
- `src/types.ts` defines persisted state and money-related types.
- `src/state.ts` is the reducer. Active entries are stored in canonical calculation
  order; consumed entries are stored separately in the same `entries` array by status.
- `src/domain/calculateRounds.ts` is the pure round algorithm.
- `src/domain/money.ts` parses, formats, and converts decimal money using integers.
- `src/domain/currencies.ts` is the source of truth for supported currencies, quote
  units, and the corresponding settings fields.
- `src/domain/nextRoundNumber.ts` derives the next round number from both consumed
  entries and winner history.
- `src/domain/moscowTime.ts` isolates Moscow-time input and display behavior.
- `src/storage/localStorage.ts` validates, migrates, loads, and saves state only for
  the standalone static mode. Local backend mode does not import this data.
- `src/integrations/calculatorBackend.ts` is the local calculator-state API client.
- `src/integrations/donationAlerts.ts` contains validated pending/acknowledgement API
  helpers retained for compatibility and focused tests; local `App` mode no longer
  polls it because `CalculatorService` performs reconciliation.
- `src/components/` contains presentational and interactive React components.

Keep domain logic independent of React and browser APIs. Prefer adding tests around a
domain function instead of embedding calculation behavior in a component.

## Calculation invariants

Money is stored as integer tenths. For example, `5000.0 RUB` is `50_000`. Do not replace
this with floating-point money arithmetic.

The calculation rules are:

1. Only active entries participate.
2. Entries are processed in canonical queue order (oldest to newest unless the user
   explicitly reordered them). The reversed active-list rendering is presentation only.
3. Foreign currencies are converted to RUB using the saved rate and quote-unit size.
4. The algorithm completes as many whole rounds as the active RUB total permits.
5. A donation crossing a round boundary is split. The needed part closes the current
   round and the remainder stays active or continues into later rounds.
6. The allocated portion that closes a round decides its winner mode. Apply this rule
   independently at every boundary crossed by a split entry.
7. If the closing portion has `isChat: true`, `Chat` wins regardless of regular totals;
   `winningRubTenths` is the sum of Chat-attributed portions in that round.
8. If the closing portion is regular, exclude all Chat-attributed portions, aggregate
   equivalent regular nicknames case-insensitively with surrounding whitespace
   ignored, and preserve the first display spelling.
9. In regular mode, the largest aggregate wins. A tie stores all winning nicknames in
   first-appearance order. A regular closer guarantees a non-empty candidate set.
10. Keep a regular donor literally named `Chat` separate from shared Chat attribution;
    persist `isChatWinner` on new results to disambiguate them.
11. One nickname may win multiple rounds. Incomplete rounds produce no winner and
    leave their entries active.
12. Consumed currency values and applied rates are frozen. Later rate changes must not
   alter consumed rows or winner history.
13. Round numbering continues after the highest round found in either consumed entries
   or winner history. Clearing only winner history must not reset numbering.

The supported calculator and DonationAlerts currencies are:

- `RUB`
- `USD`
- `EUR`
- `BYN`
- `KZT`
- `UAH`
- `BRL`
- `TRY`
- `PLN`
- `UZS`

Quotes are per 1 unit for EUR, USD, BYN, BRL, and PLN; per 100 KZT; per 10 UAH and
TRY; and per 10,000 UZS. EUR and USD are always visible in settings. The other rates
are hidden behind the additional-currencies control.

## Calculator persistence

The local Python service owns `AppState` in the SQLite `calculator_state` row. All
local UI mutations, DonationAlerts imports, overlay reads, and API-triggered
calculations operate on that state. The browser refreshes it from the backend and is
not required to remain open. There is intentionally no automatic localStorage-to-SQLite
migration.

The static build continues to persist `AppState` in `localStorage` under
`gambalator:state`. Its schema version and migrations are defined in
`src/storage/localStorage.ts`.

When changing the standalone browser-persisted shape:

1. Bump the schema version when appropriate.
2. Add validation for the new shape.
3. Add a migration that preserves valid user data.
4. Add or update `tests/storage.test.ts`.

For backend calculator-state changes, update Python validation and schema handling,
keep the TypeScript contract aligned, and test both modes. Do not add an automatic
localStorage-to-SQLite migration unless the operator explicitly changes that decision.

`AppState.history` means winner history. Consumed donation history is represented by
`ContributionEntry` rows whose `status` is `consumed`; do not confuse the two.

## DonationAlerts reliability model

The backend is an independent Python project in `backend/`. The optional preparation
kit under `extras/only-da-goal/` contains a reference `start.py`, ready `1.bat` and
`run_all.py` files, and the new `templates/donationGoalGambalator.html`. A user's
customized `start.py` must not be replaced wholesale; all three marked integration
blocks are merged manually from the reference file. The kit must not contain or
replace the legacy `templates/donationGoalRGG.html`. Its step-by-step installation
guide is `ONLY_DA_GOAL_INSTALL_RU.md`. Gambalator itself must not import from
Only_DA-Goal; the companion talks to Gambalator only through its loopback HTTP API.

Important backend modules:

- `backend/src/gambalator_backend/app.py`: Flask routes and static frontend serving.
- `config.py`: cross-platform paths, environment settings, host, and port.
- `credentials.py`: OS keyring and local-file fallback.
- `oauth.py`: OAuth configuration, state validation, token exchange, and refresh.
- `donationalerts.py`: DonationAlerts HTTP client.
- `sync.py`: polling, catch-up pagination, normalization, and persisted cursor behavior.
- `database.py`: SQLite schema, pending/acknowledged donations, deduplication, and
  historical-restore queries.
- `calculator.py`: authoritative state, backend actions, donation reconciliation,
  round calculation, and overlay projection.

The safe import sequence is deliberate:

1. The backend polls DonationAlerts and inserts normalized donations into SQLite using
   the DonationAlerts ID as a unique key.
2. The backend reconciles supported pending donations into calculator state inside a
   serialized SQLite mutation.
3. Only after calculator-state persistence succeeds does it acknowledge the source ID.
4. A startup/read reconciliation recovers a crash between state persistence and
   acknowledgement without creating a duplicate entry.

Never acknowledge before calculator-state persistence. Retries must remain idempotent.

On the first successful sync, `GAMBALATOR_IMPORT_EXISTING=false` establishes the newest
DonationAlerts ID as a baseline rather than importing the account's entire history.
Later syncs paginate until they reach the persisted ID, which recovers donations
received while the app was offline.

Historical import scans DonationAlerts page-number pagination from page 1 back to a
confirmed UTC cutoff and archives newly discovered supported IDs as acknowledged. It
does **not** rewind the forward DonationAlerts cursor;
`donationalerts.history_oldest_at` records the oldest completed scan separately.
Newly discovered history is always stored with `is_chat = false`. Preview and confirm
derive exclusions server-side from active calculator rows only. Consumed rows and
winner history must not block explicit replay. Confirmation writes the full original
donation directly into active calculator state with a fresh internal entry ID while
retaining its DonationAlerts source ID; it does not move the ledger row through
`pending` or delete old results. Keep historical page requests serialized with normal
polling and rate-limited. Normal live reconciliation remains stricter and deduplicates
against both active and consumed rows for crash-safe idempotency.

Historical-download time entry uses `DarkDatePicker` plus a custom 24-hour `ЧЧ:ММ` field so
neither the calendar theme nor time format is inherited from the operating system.
When missing DonationAlerts entries return,
`CalculatorService` inserts them among other DonationAlerts entries by parsed `donatedAt` and
then numeric external ID. Preserve the relative order of rows already in the queue,
especially manually added or manually reordered entries.

Automatic Chat attribution is backend-owned and persisted under
`donationalerts.auto_chat`. `SyncService` snapshots it at the start of a sync and
stores `is_chat` on every newly received donation in that batch. Pending and restored
donations retain that captured value; changing the global switch must not
rewrite existing donations. Previously unknown historical donations are the exception:
they are deliberately archived with `is_chat = false`. The frontend maps backend `isChat` to the row-level
`ContributionEntry.isChat` flag. Keep the GET, explicit PUT, toggle POST, integration
status, frontend control, DTO validation, database migration, and documentation in
sync when changing this feature.

DonationAlerts `created_at` strings without an offset are treated as UTC and displayed
in Moscow time (`МСК`). Historical-download inputs are Moscow wall time and
are converted to UTC before calling the backend.

The integration panel displays two independent links:

- `Веб-страница → Локальный сервер`
- `Локальный сервер → DonationAlerts`

Do not collapse these into one ambiguous connection flag. A reachable backend can
still have an OAuth or DonationAlerts synchronization error.

The optional Only_DA-Goal companion exposes `/donationObsOverlay` on port 5000 and
reads `/api/overlay/state`; its public legacy `/donationGoalRGG` route remains
independent. Its new global F6 and F7 bindings request one round and all available
rounds respectively through `/api/calculator/actions`. The original F20/F21/F22
bindings keep their legacy behavior. Successful 200 responses from the 750 ms overlay
poll are filtered from Werkzeug logs, but failures such as 503 remain visible. The
`run_all.py` supervisor starts and stops both process trees, expects a sibling
`Gambalator` directory by default, and supports `GAMBALATOR_DIR` as an override.

An expired access token is refreshed automatically. If DonationAlerts rejects the
refresh token with an authentication response, `OAuthManager` sets
`reauthorizationRequired`; transient server and network failures must not set that
flag. The frontend then offers a user-initiated one-click authorization restart with
the stored App ID and API Key. A successful code exchange clears both the flag and
the stale synchronization error.

## Credentials and security

- The UI uses DonationAlerts' names `App ID` and `API Key`.
- Prefer the operating-system credential manager. Automatic mode falls back to
  `donationalerts-credentials.json` in the application data directory and tells the
  user the fallback is not secure storage.
- Never return an API key, access token, or refresh token through a frontend API.
- Report only `apiKeyStored` when the secret exists. Use a masked input placeholder
  after disconnecting; never use mask characters as a submitted credential value.
- Never commit `backend/.env`, credential files, SQLite databases, or generated build
  directories.
- An environment access token is supported for development, but interactive OAuth is
  the normal client workflow.
- Keep the server loopback-bound unless a task explicitly introduces and secures a
  different deployment model.

## Runtime modes and commands

Use `mise` for tool installation and project commands.

```bash
mise trust
mise install
mise run setup
mise run backend-setup
```

Frontend development only:

```bash
mise run dev
```

Complete local app with DonationAlerts support:

```bash
mise run local
```

Convenience launchers after setup:

```bash
./start-gambalator.sh       # Linux
start-gambalator.cmd        # Windows
```

Directly openable static build:

```bash
mise run build-single
```

`dist-single/index.html` supports the manual calculator but cannot connect to the
local DonationAlerts API when opened as an isolated file. The ordinary local backend
serves `dist/` and its API from the same origin at `http://127.0.0.1:5741`.

Run all validation before handing off a change:

```bash
mise run check
```

This runs TypeScript type checking, ESLint, the Vitest suite, Ruff, Pytest, and the
production Vite build. Use focused tests while iterating, but finish with the full
check for implementation changes.

## Deployment

`.github/workflows/deploy.yml` builds and deploys `dist/` to GitHub Pages. This is a
static frontend deployment: DonationAlerts OAuth and reliable synchronization require
the local Python service and are not available from GitHub Pages alone.

The current Vite production base is `/`, suitable for the intended organization site
at `gambalator.github.io`. Treat `vite.config.ts` as the build source of truth if older
documentation disagrees.

## Change checklist

Before completing a task, verify the relevant items:

- Visible copy remains Russian.
- Active display reversal has not changed canonical calculation order.
- Integer-tenths arithmetic and currency quote units are preserved.
- Split entries retain source/rate/import references where applicable.
- Imported rows are saved before acknowledgement and still deduplicate by source ID.
- Persisted shape changes include validation, a schema decision, and tests. Static
  localStorage changes still require a browser migration.
- DonationAlerts API changes update backend routes, frontend DTOs, tests, and docs.
- Windows paths and launch behavior are not broken by Linux-only assumptions.
- Gambalator remains independent from the sibling `Only_DA-Goal`; companion changes
  remain isolated and documented.
- `mise run check` passes.
