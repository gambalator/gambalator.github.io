# Gambalator

Gambalator is a desktop-oriented, Russian-language donation round calculator with an
optional DonationAlerts integration. It keeps an ordered queue of donations, converts
supported currencies to RUB, fills fixed-value rounds (`Гамбашары`), and records the
largest contributor in every completed round.

The recommended mode is a completely local application: one Python process serves the
compiled React frontend and the local API at <http://127.0.0.1:5741>. The backend polls
DonationAlerts, catches up after downtime, and stores its cursor and donation ledger in
SQLite. No separately running frontend development server is needed for normal use.

## Current features

- Manual and automatic DonationAlerts donation entry.
- Ordered active queue with newest-first visual presentation and oldest-first default
  calculation order.
- Drag-and-drop ordering, inline editing, row deletion, and one-decimal amounts.
- `RUB`, `BRL`, `BYN`, `EUR`, `KZT`, `PLN`, `TRY`, `UAH`, `USD`, and `UZS` conversion using editable
  rates.
- Automatic calculation of every complete round and automatic splitting of donations
  that cross a round boundary.
- Per-round winner selection, including every nickname when the maximum contribution
  is tied.
- Per-row golden `Chat` attribution and a persisted backend Auto-Chat mode for newly
  received DonationAlerts donations.
- Collapsible used-entry history grouped by round, with winners and Chat-attributed
  rows highlighted.
- Newest-first winner history, latest-result emphasis, and a wide popup for long
  nicknames.
- Confirmed reimport of locally stored DonationAlerts donations from a Moscow date and
  24-hour time, including `10 МИН`, `1 ЧАС`, `СЕГОДНЯ`, `3 ДНЯ`, and `5 ДНЕЙ`
  shortcuts.
- Independent page-to-backend and backend-to-DonationAlerts connection indicators.
- Automatic browser and backend persistence across restarts and project-folder
  updates.

Detailed operator documentation is available in Russian:

- [Windows installation and launch guide](./WINDOWS_INSTALL_RU.md)
- [Complete frontend user guide](./USER_GUIDE_RU.md)
- [Calculation and currency rules](./CALCULATION_LOGIC_RU.md)

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
  ├── SQLite           → cursor, donations, acknowledgements, Auto-Chat
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

1. Start the complete local application and expand the `DonationAlerts` panel.
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

Supported donations are saved to browser storage before the frontend acknowledges
them in SQLite. Source IDs make polling and acknowledgement retries idempotent.
Unsupported currencies remain pending and are reported in the UI instead of receiving
an invented conversion rate.

See [backend/README.md](./backend/README.md) for OAuth configuration, environment
overrides, API routes, synchronization behavior, and backend-only development details.

## Auto-Chat API

The connected UI contains an `Авто-Chat для новых донатов` switch. Its state is stored
in SQLite and captured when the backend receives each new donation. Changing it does
not rewrite donations already stored by the backend, and reimported rows retain their
original value.

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

## Reimport behavior

The connected DonationAlerts panel can return acknowledged local records to the
pending queue from a selected Moscow date and time. Reimport:

- previews the number of restorable donations and requires confirmation;
- excludes DonationAlerts source IDs still present in browser state;
- does not duplicate existing active or consumed rows;
- does not rewind the DonationAlerts synchronization cursor;
- preserves the Chat value captured when each donation was first received;
- reinserts restored donations into their original chronological calculation position;
- acknowledges imported rows sequentially to avoid saturating the local request queue;
- does not alter winner history.

Only donations already stored in the local SQLite database can be reimported. This is
not a general download of the DonationAlerts account's complete history.

## Persistence

| Data | Default location |
|---|---|
| Calculation settings, active and consumed entries, ordering, Chat flags, winner history | Browser `localStorage` for `http://127.0.0.1:5741`, key `gambalator:state` |
| DonationAlerts cursor, normalized donations, pending/acknowledged state, Auto-Chat | SQLite in the OS application-data directory |
| App ID, API Key, access token, refresh token | OS credential store when available; application-data file fallback |

Default backend data directories:

- Linux: `$XDG_DATA_HOME/gambalator`, or `~/.local/share/gambalator`;
- Windows: `%LOCALAPPDATA%\Gambalator`.

Set `GAMBALATOR_DATA_DIR` to override the backend location for development or testing.
Credential and database files must never be committed.

Because normal state lives outside the source directory, a newly downloaded copy on
the same computer reuses it when started under the same OS user. Frontend state also
requires the same browser profile, scheme, host, and port. For example,
`http://localhost:5741` and `http://127.0.0.1:5741` have separate browser storage.

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

## Standalone file

Create a self-contained page:

```bash
mise run build-single
```

Open `dist-single/index.html` directly in a browser. The file contains the frontend
code, CSS, and logo, and can be copied by itself after it has been built.

Standalone mode supports the manual calculator. It cannot use DonationAlerts OAuth,
reliable synchronization, Auto-Chat, or reimport because no Python API is running.
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
