# Gambalator

Gambalator is a desktop-oriented, Russian-language donation round calculator with an
optional DonationAlerts integration. It keeps an ordered queue of donations, converts
supported currencies to RUB, fills fixed-value rounds (`Гамбашары`), and records the
winner of every completed round according to its closing donation.

The recommended mode is a completely local application: one Python process serves the
compiled React frontend and the local API at <http://127.0.0.1:5741>. The backend polls
DonationAlerts, catches up after downtime, and stores its cursor and donation ledger in
SQLite. No separately running frontend development server is needed for normal use.

## Current features

- Manual and automatic DonationAlerts donation entry.
- Ordered active queue with oldest-first visual presentation and calculation order by
  default, plus an orange border around the exact entries needed for the next complete
  round.
- Drag-and-drop ordering, inline editing, row deletion, and one-decimal amounts.
- Reversible manual and automatic visual grouping with editable names, expandable
  source rows, block drag-and-drop, bulk removal, strict Chat/non-Chat separation, and
  groups that remain after Auto is disabled or the page is reloaded.
- `RUB`, `BRL`, `BYN`, `EUR`, `KZT`, `PLN`, `TRY`, `UAH`, `USD`, and `UZS` conversion using editable
  rates.
- Separate actions for calculating one complete round or every currently available
  round, with automatic splitting of donations that cross a boundary.
- Closing-donation winner mode: a Chat closer makes Chat win, while a regular closer
  excludes Chat-attributed portions and compares regular nickname totals, including
  exact ties.
- Per-row golden `Chat` attribution and a persisted backend Auto-Chat mode for newly
  received DonationAlerts donations.
- Merged round history: winner summaries open in a wide scrollable popup, and each
  summary row unfolds the participant donations for that round with winner and Chat
  attribution highlighted.
- Last-winner details in the page summary, latest-result emphasis, wrapping for long
  nicknames, and separate cleanup actions for active donations and completed history.
- Confirmed historical download and restore from a Moscow date and 24-hour time,
  including `10 МИН`, `1 ЧАС`, `СЕГОДНЯ`, `3 ДНЯ`, and `5 ДНЕЙ` shortcuts.
- Independent page-to-backend and backend-to-DonationAlerts connection indicators.
- Optional Only_DA-Goal companion with a synchronized OBS overlay, one-console
  supervisor, and global F6/F7 actions for one/all round calculation.
- Backend SQLite persistence in local mode and separate browser persistence in static
  mode, both surviving restarts; local data also survives project-folder updates.

Detailed operator documentation is available in Russian:

- [Windows installation and launch guide](./WINDOWS_INSTALL_RU.md)
- [Complete frontend user guide](./USER_GUIDE_RU.md)
- [Calculation and currency rules](./CALCULATION_LOGIC_RU.md)
- [Step-by-step Only_DA-Goal preparation](./ONLY_DA_GOAL_INSTALL_RU.md)
- [Only_DA-Goal companion and OBS integration](./ONLY_DA_GOAL_COMPANION_RU.md)

Engineering references:

- [Backend setup, API, and synchronization details](./backend/README.md)
- [Product requirements](./PRD.md)
- [Architecture and invariants for coding assistants](./AGENTS.md)

## Runtime architecture

```text
Browser: http://127.0.0.1:5741
                 │
                 ▼
Local Python server
  ├── / and /assets/*  → compiled React frontend from dist/
  ├── /api/*           → local Gambalator API
  ├── SQLite           → calculator state, donations, cursors, Auto-Chat
  └── OAuth/API        → DonationAlerts
```

Node and Vite build the frontend before startup and then exit. The Python process is
the only long-running local server in normal operation.

## Requirements

- [mise](https://mise.jdx.dev/)
- Internet access during initial dependency installation and DonationAlerts
  synchronization.

`mise.toml` currently provisions Node.js 24, npm 11, Python 3.13, and `uv`.

For a client installation on Windows, follow
[WINDOWS_INSTALL_RU.md](./WINDOWS_INSTALL_RU.md) instead of relying only on this short
developer-oriented setup.

## First setup

From the repository root:

```bash
mise trust
mise install
mise run setup
mise run backend-setup
```

This installs the locked frontend packages and creates the backend Python environment.
Generated dependencies and build output remain untracked.

## Run the complete local application

Use the cross-platform mise task:

```bash
mise run local
```

Or use the convenience launcher after the initial mise installation:

```bash
# Linux
./start-gambalator.sh

# Windows Command Prompt or PowerShell
.\start-gambalator.cmd
```

The launchers install frontend dependencies when `node_modules` is absent. `mise run
local` rebuilds the frontend and starts the Python service. Open
<http://127.0.0.1:5741> and leave the terminal open while using the application.

The default port is `5741`, allowing the independent legacy application to remain on
port `5000`. Stop an older Gambalator process before starting another copy on the same
port.

## DonationAlerts setup

1. Start the complete local application and press the `DonationAlerts` status button in the header.
2. Register an application at
   <https://www.donationalerts.com/application/clients>.
3. Use the exact Redirect URI displayed by Gambalator. With the default port it is:

   ```text
   http://127.0.0.1:5741/api/oauth/callback
   ```

4. Enter the DonationAlerts **App ID** and **API Key** in Gambalator.
5. Press `ПОДКЛЮЧИТЬ DONATIONALERTS` and authorize the intended DonationAlerts
   account.

The backend requests only the `oauth-donation-index` scope. It stores the access and
refresh tokens locally and refreshes an expired access token automatically. If the
refresh token is rejected, the UI requests reauthorization while retaining the saved
App ID and API Key.

On the first successful synchronization, the default behavior is to save the newest
DonationAlerts ID as a baseline without importing the account's existing history.
Donations received after that baseline are fetched on later polls. Subsequent restarts
continue from the persisted ID and catch up donations received while Gambalator was
offline.

Supported donations are inserted into backend-owned calculator state before they are
acknowledged in SQLite. Source IDs make reconciliation and acknowledgement retries idempotent,
and the browser does not need to be open.
Unsupported currencies remain pending and are reported in the UI instead of receiving
an invented conversion rate.

Manual additions, edits, ordering, Chat changes, settings, calculations, and winner
history are also persisted by the backend in local mode. They are not stored in the
DonationAlerts `donations` ledger; both kinds of data share the same SQLite file but
use different tables.

See [backend/README.md](./backend/README.md) for OAuth configuration, environment
overrides, API routes, synchronization behavior, and backend-only development details.

## Auto-Chat API

The header contains a `Chat all` switch for new DonationAlerts donations. Its state is stored
in SQLite and captured when the backend receives each new donation. Changing it does
not rewrite donations already stored by the backend, and restored rows retain their
original value. Previously unknown rows discovered by a historical scan are always
stored with Chat disabled.

The same setting can be controlled through the loopback API while Gambalator is
running:

```bash
# Read the current value
curl http://127.0.0.1:5741/api/settings/auto-chat

# Invert the current value
curl --request POST http://127.0.0.1:5741/api/settings/auto-chat/toggle

# Explicitly enable it
curl --request PUT --header "Content-Type: application/json" --data '{"enabled":true}' http://127.0.0.1:5741/api/settings/auto-chat
```

Use `{"enabled":false}` to disable it explicitly. On Windows PowerShell, use
`curl.exe` instead of `curl` if `curl` is mapped to a PowerShell command.

## Historical download and restore

The DonationAlerts popup can download account history back to a selected
Moscow date and time and restore known rows removed from calculator state. The flow:

- scans DonationAlerts pages back to the selected timestamp before showing a preview;
- archives newly discovered supported IDs in SQLite without activating them until confirmation;
- imports newly downloaded history as regular rows with Chat disabled;
- does not duplicate a DonationAlerts source ID that is still in the active queue;
- deliberately ignores consumed rows and winner history when deciding what can be
  restored, so an already calculated or manually removed donation can be added again
  in full for a new calculation;
- does not rewind the DonationAlerts synchronization cursor;
- preserves the captured Chat value of records that were already known locally;
- reinserts restored donations into their original chronological calculation position;
- keeps the DonationAlerts ledger acknowledged and writes restored active rows
  directly to authoritative calculator state;
- does not alter winner history.

Repeating the operation with an earlier date does not download duplicate ledger rows.
If prior donations are still active, selecting five days after three days adds only
newly discovered older IDs. Donations that have since been consumed or manually
removed are intentionally restored again when they fall in the selected range. Their
previous consumed rows and winner results remain until the operator clears them. The
backend records the oldest successfully scanned timestamp separately from the forward
live-donation cursor.

## Persistence

| Data | Default location |
|---|---|
| Calculation settings, active and consumed entries, ordering, Chat flags, winner history (local mode) | SQLite in the OS application-data directory |
| Static-build calculator state | Browser `localStorage`, key `gambalator:state` |
| Visual groups, names, Auto state, and unmerge exclusions | Browser `localStorage`, key `gambalator:entry-list-grouping:v1` |
| DonationAlerts cursor, normalized donations, pending/acknowledged state, Auto-Chat | The same SQLite database |
| Earliest successfully scanned DonationAlerts history timestamp | The same SQLite database (`sync_state`) |
| App ID, API Key, access token, refresh token | OS credential store when available; application-data file fallback |

There is intentionally no automatic migration from an older browser `localStorage`
state into backend SQLite. The first local-backend run starts with default calculator
state without deleting the separate static-browser data.

Default backend data directories:

- Linux: `$XDG_DATA_HOME/gambalator`, or `~/.local/share/gambalator`;
- Windows: `%LOCALAPPDATA%\Gambalator`.

Set `GAMBALATOR_DATA_DIR` to override the backend location for development or testing.
Credential and database files must never be committed.

`gambalator.sqlite3` is a binary SQLite database rather than a readable text file. It
can be inspected with DB Browser for SQLite or the `sqlite3` command while the app is
stopped. Back it up before making manual changes. `calculator_state` contains the
calculator JSON, `donations` contains the DonationAlerts ledger, and `sync_state`
contains synchronization cursors and switches.

Because normal state lives outside the source directory, a newly downloaded copy on
the same computer reuses it when started under the same OS user. Only the standalone
static build has browser-profile-specific state.

## Theme customization

The beginning of `src/styles.css` contains a commented `EASY THEME SETTINGS` block.
All literal color values live in that block; component rules reference its CSS custom
properties. The main `--color-*` values change the shared palette, while searchable
`--button-*` aliases are annotated with visible button names for non-programmer edits.
`--font-weight-all` controls the weight of all project text from one line and defaults
to `500`, matching the `АКТИВНЫЕ ЗАПИСИ` heading.

## Frontend development

Run the Vite development server without starting the Python backend:

```bash
mise run dev
```

Open the URL printed by Vite. This mode is intended for frontend work; automatic
DonationAlerts features require the local Python API. Use `mise run local` to exercise
the integrated production build.

Useful tasks:

| Command | Purpose |
|---|---|
| `mise run setup` | Install locked npm dependencies with `npm ci` |
| `mise run backend-setup` | Install backend and development dependencies with `uv` |
| `mise run dev` | Start the frontend-only Vite development server |
| `mise run build` | Create the normal production frontend in `dist/` |
| `mise run local` | Build the frontend and run the complete local application |
| `mise run backend-dev` | Run the backend against the existing `dist/` without rebuilding it |
| `mise run build-single` | Create a directly openable manual-only page |
| `mise run check` | Run all frontend/backend checks and the production build |

### Windows development mode with DonationAlerts

Use `start-gambalator-dev.cmd` when working on the interface. It starts the normal
DonationAlerts backend and a Vite development server together. Open
`http://127.0.0.1:5173`; changes to frontend source files appear immediately through
hot reload. Press `Ctrl+C` in its console window to stop both services.

The regular `start-gambalator.cmd` remains the production-style launcher on port 5741.

## Standalone file

Create a self-contained page:

```bash
mise run build-single
```

Open `dist-single/index.html` directly in a browser. The file contains the frontend
code, CSS, and logo, and can be copied by itself after it has been built.

Standalone mode supports the manual calculator. It cannot use DonationAlerts OAuth,
reliable synchronization, Auto-Chat, or historical download because no Python API is running.
Storage behavior for a `file://` page depends on the browser and is always separate
from the state at `http://127.0.0.1:5741`.

## GitHub Pages

`.github/workflows/deploy.yml` runs the complete check and deploys `dist/` after a push
to `main`. Pull requests run validation without deployment. Configure the repository's
Pages source as **GitHub Actions**.

The production Vite base is `/`, matching the intended organization site at
`gambalator.github.io`.

GitHub Pages is a static frontend deployment. The manual calculator works there, but
DonationAlerts OAuth and synchronization require the local Python backend and are not
provided by GitHub Pages alone.

## Project structure

```text
src/                         React UI, application state, calculation domain
tests/                       Vitest frontend tests
backend/                     Independent Python backend and Pytest tests
scripts/                     Build helpers
CALCULATION_LOGIC_RU.md      Russian calculation rules and examples
USER_GUIDE_RU.md             Russian frontend/operator guide
WINDOWS_INSTALL_RU.md        Russian Windows installation guide
PRD.md                       Product requirements
AGENTS.md                    Architecture and invariants for coding assistants
```

## Quality checks

Run the full validation suite before handing off a change:

```bash
mise run check
```

It runs TypeScript type checking, ESLint, the Vitest suite, Ruff, the Pytest suite, and
the production Vite build.
