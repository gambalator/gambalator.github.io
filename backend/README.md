# Gambalator local backend

This is a new, independent Python project. It does not import from or modify the
legacy application under `pscript/Only_DA-Goal`.

The backend:

- polls the official DonationAlerts donation-list API;
- establishes a baseline on its first connection instead of importing the
  account's entire history;
- retrieves donations received since the previous successful run;
- stores normalized donations and synchronization state in SQLite;
- stamps newly received donations with the persisted automatic Chat-attribution state;
- imports pending RUB, USD, EUR, BYN, KZT, UAH, BRL, and TRY donations into the active Gambalator queue;
- serves the frontend production build from `dist` when it exists.

## Setup

From the repository root:

```bash
mise install
mise run backend-setup
```

## Run

Build the frontend and start the local service:

```bash
mise run local
```

Open <http://127.0.0.1:5741>. Port `5741` is used so Gambalator can run at the
same time as the legacy Python application on port `5000`.

After setup, use either `mise run local` or one of the repository launchers to
build the frontend and start the complete local application with one command:

```bash
# Linux
./start-gambalator.sh

# Windows Command Prompt or PowerShell
.\start-gambalator.cmd
```

The synchronization service can also be started
without rebuilding the frontend:

```bash
mise run backend-dev
```

Expand the `DonationAlerts` panel in Gambalator. It shows the exact Redirect URI
to register at <https://www.donationalerts.com/application/clients>. Enter the
application's App ID and API Key, then press `ПОДКЛЮЧИТЬ
DONATIONALERTS`. Authorization is completed on DonationAlerts and returns to
the local application.

The backend requests only the `oauth-donation-index` scope. It exchanges the
temporary authorization code locally, stores the resulting access and refresh
tokens, and refreshes expired access tokens automatically.

If DonationAlerts rejects the saved refresh token, the interface reports that
authorization is required again instead of treating it as a temporary network
failure. Press `ПЕРЕПОДКЛЮЧИТЬ DONATIONALERTS` to repeat only the
DonationAlerts authorization step; the saved App ID and API Key are reused. The
application never redirects to DonationAlerts automatically on startup. After
manual disconnection, a masked API Key placeholder indicates that the key is
still stored locally without returning the key itself to the browser.

The operating-system credential store is preferred. Windows uses Credential
Manager; Linux uses an available Secret Service provider. If no system keyring
is available, automatic mode falls back to
`donationalerts-credentials.json` in the application-data directory and reports
that fallback in the interface. Set `GAMBALATOR_CREDENTIAL_STORE=keyring` to
require secure system storage and fail instead of falling back.

For development, an already-issued token may still be placed in an ignored
`backend/.env` as `GAMBALATOR_DA_ACCESS_TOKEN`. This disables the interactive
OAuth flow and automatic refresh.

## First synchronization

The default `GAMBALATOR_IMPORT_EXISTING=false` prevents old account history from
appearing as new Gambalator entries. The first successful request saves the
latest DonationAlerts ID as a baseline. Later runs retrieve everything newer
than that ID.

Set `GAMBALATOR_IMPORT_EXISTING=true` only when historical donations should be
imported during the first synchronization.

The browser checks the backend's pending queue every five seconds. Supported
donations are appended in chronological order, saved to `localStorage`, and
only then acknowledged in SQLite. The persisted DonationAlerts source ID makes
retries and restarts idempotent. Unsupported currencies remain pending and are
reported in the interface instead of being converted incorrectly.

The connected DonationAlerts panel can place acknowledged donations back into
the pending queue from a selected Moscow date and time. The browser converts the
selection from Moscow time to UTC before sending it to the backend. A preview and confirmation
are required; the synchronization cursor is not changed, and frontend source
IDs prevent rows that still exist from being counted or duplicated. Both reimport
requests accept an optional `excludeSourceIds` string array containing the IDs
already present in the browser. Imported donations are acknowledged sequentially
so a large restore does not occupy every Waitress request worker at once.
The UI uses a browser-independent 24-hour `ЧЧ:ММ` field. Restored rows are
inserted relative to other DonationAlerts rows by `donatedAt`, with the numeric
DonationAlerts ID used to break equal-time ties; they are not appended to the end of
the calculation queue.

## Automatic Chat attribution

The `Авто-Chat для новых донатов` switch is off by default and is
stored in SQLite. Its value is captured when the backend receives a new donation.
Changing it does not rewrite donations already stored in the backend. Reimported
donations retain the value captured when they were originally received.

Read, explicitly set, or invert the switch through the loopback API:

```bash
curl http://127.0.0.1:5741/api/settings/auto-chat
curl --request PUT --header "Content-Type: application/json" \
  --data '{"enabled":true}' \
  http://127.0.0.1:5741/api/settings/auto-chat
curl --request POST http://127.0.0.1:5741/api/settings/auto-chat/toggle
```

Each response has the form `{"enabled":true}` or `{"enabled":false}`. The
frontend refreshes the displayed switch from the backend within five seconds.

## API

- `GET /api/health` — local server health.
- `GET /api/integration/status` — connection and synchronization status.
- `POST /api/integration/oauth/configure` — save the DonationAlerts App ID and API Key.
- `POST /api/integration/oauth/start` — create the authorization URL.
- `GET /api/oauth/callback` — exchange the authorization code for tokens.
- `POST /api/integration/disconnect` — remove OAuth tokens while retaining app credentials.
- `GET /api/settings/auto-chat` — read automatic Chat attribution.
- `PUT /api/settings/auto-chat` — set it with an `{"enabled": true|false}` body.
- `POST /api/settings/auto-chat/toggle` — invert it and return its new value.
- `GET /api/donations/pending?limit=100` — donations waiting for the frontend.
- `POST /api/donations/<id>/acknowledge` — mark a donation as imported.
- `POST /api/donations/reimport/preview` — count missing acknowledged donations since an ISO 8601 timestamp; accepts optional `excludeSourceIds`.
- `POST /api/donations/reimport` — return missing acknowledged donations to the pending queue; accepts optional `excludeSourceIds`.
- `POST /api/integration/sync` — request an immediate synchronization.

The API never returns the API Key, access token, or refresh token. OAuth status
contains only the safe booleans `apiKeyStored` and `reauthorizationRequired`.

## Local data

By default, SQLite is stored in the platform application-data directory:

- Linux: `$XDG_DATA_HOME/gambalator`, or `~/.local/share/gambalator`.
- Windows: `%LOCALAPPDATA%\Gambalator`.

Set `GAMBALATOR_DATA_DIR` to use another location while developing or testing.

## Checks

```bash
mise run backend-check
```
