# Gambalator local backend

This is an independent Python project. It does not import from the optional sibling
`Only_DA-Goal`; that companion communicates only through the loopback HTTP API.

The backend:

- polls the official DonationAlerts donation-list API;
- establishes a baseline on its first connection instead of importing the
  account's entire history;
- retrieves donations received since the previous successful run;
- stores normalized donations and synchronization state in SQLite;
- stamps newly received donations with the persisted automatic Chat-attribution state;
- imports pending RUB, BRL, BYN, EUR, KZT, PLN, TRY, UAH, USD, and UZS donations into the active Gambalator queue;
- loads official daily RUB exchange rates from the Bank of Russia on request;
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

`GAMBALATOR_IMPORT_EXISTING=true` is a development/startup override that imports the
available account history during the first ordinary synchronization. The normal
operator workflow keeps the default `false` and uses the confirmed **Загрузка
истории** action, whose newly discovered records are always regular (`is_chat=false`).

The backend reconciles supported pending donations directly into its authoritative
calculator state and only then acknowledges them. The browser does not need to be
open. The persisted DonationAlerts source ID makes retries and restarts idempotent.
Unsupported currencies remain pending instead of being converted incorrectly.

The connected DonationAlerts panel scans remote account history back to a selected
Moscow date and time, archives newly discovered supported donations, and can also
restore known acknowledged donations directly into calculator state. The browser converts the
selection from Moscow time to UTC before sending it to the backend. A preview and
confirmation are required. The forward synchronization cursor is never changed;
the separate `donationalerts.history_oldest_at` state records the oldest completed
scan. The backend excludes only source IDs currently present in active calculator
rows. Consumed rows and winner history deliberately do not block an explicit restore,
allowing a full original donation to be replayed after calculation or manual removal.
Each replay gets a new internal entry ID while retaining its DonationAlerts source ID.
Newly discovered historical donations always use `is_chat = false`; previously known
donations keep their captured Chat value.

Because DonationAlerts exposes page-number pagination rather than a date filter, a
history scan starts at page 1 and stops after crossing the selected timestamp. Requests
after the first page are spaced by 1.05 seconds to respect the documented API limit.
The scan and the regular poller share a lock, so live synchronization resumes after
the historical scan. Newly discovered rows remain acknowledged until the operator
confirms; the backend then writes restored entries directly to calculator state without
moving ledger rows through `pending`.
If the scan errors or reaches `GAMBALATOR_MAX_PAGES_PER_SYNC` before the chosen time,
it saves neither partial rows nor the historical boundary.
The UI uses a browser-independent 24-hour `ЧЧ:ММ` field. Restored rows are
inserted relative to other DonationAlerts rows by `donatedAt`, with the numeric
DonationAlerts ID used to break equal-time ties; they are not appended to the end of
the calculation queue.

## Automatic Chat attribution

The `Авто-Chat для новых донатов` switch is off by default and is
stored in SQLite. Its value is captured when the backend receives a new donation.
Changing it does not rewrite donations already stored in the backend. Restored
donations retain the value captured when they were originally received. Donations
first discovered by a historical scan are stored with Chat disabled.

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
- `GET /api/calculator/state` — authoritative calculator state and revision.
- `POST /api/calculator/actions` — mutate entries/settings or calculate rounds.
- `GET /api/overlay/state` — active RUB total and current round target for OBS.
- `GET /api/exchange-rates` — latest Bank of Russia rates normalized to Gambalator units and tenths of a ruble.
- `GET /api/integration/status` — connection and synchronization status.
- `POST /api/integration/oauth/configure` — save the DonationAlerts App ID and API Key.
- `POST /api/integration/oauth/start` — create the authorization URL.
- `GET /api/oauth/callback` — exchange the authorization code for tokens.
- `POST /api/integration/disconnect` — remove OAuth tokens while retaining app credentials.
- `GET /api/settings/auto-chat` — read automatic Chat attribution.
- `PUT /api/settings/auto-chat` — set it with an `{"enabled": true|false}` body.
- `POST /api/settings/auto-chat/toggle` — invert it and return its new value.
- `GET /api/donations/pending?limit=100` — inspect donations still pending backend
  reconciliation (kept as a compatibility/diagnostic endpoint).
- `POST /api/donations/<id>/acknowledge` — explicitly acknowledge a pending donation;
  normal supported imports are acknowledged internally after calculator persistence.
- `POST /api/donations/reimport/preview` — scan remote history and count acknowledged donations since an ISO 8601 timestamp that are absent from the active queue.
- `POST /api/donations/reimport` — add those acknowledged donations directly to the active queue; returns the `imported` count.
- `POST /api/integration/sync` — request an immediate synchronization.

The API never returns the API Key, access token, or refresh token. OAuth status
contains only the safe booleans `apiKeyStored` and `reauthorizationRequired`.

The backend uses the exchange rates saved in calculator settings for non-RUB entries.
The UI can request current Bank of Russia rates and save them through calculator state.

External calculation requests use the same actions as the UI:

```json
{"type":"calculation/run","maxRounds":1}
```

calculates at most one complete round, while `"maxRounds": null` calculates every
currently available complete round. `GET /api/overlay/state` returns
`currentRubTenths`, `targetRubTenths`, `availableRounds`, and the calculator `revision`.
All money values in this API are integer tenths of a ruble.

The historical preview response reports the total restorable `count`, whether a
remote scan ran, how many API items were fetched, how many new rows were archived,
and how many unsupported currencies were skipped. Preview may archive new source IDs,
but only the confirmed `/api/donations/reimport` request adds them to active calculator
state. Consumed rows and winner history remain unchanged and do not suppress replay;
normal live reconciliation still deduplicates against both active and consumed rows.

The companion Only_DA-Goal process invokes `POST /api/calculator/actions` from its
global F-key listener: F6 requests `maxRounds: 1`, and F7 requests `maxRounds: null`.
Calculation still runs transactionally in this backend, so the Gambalator web page
does not need to be open. Only_DA-Goal's original F20/F21/F22 listener remains
separate.

## Local data

By default, SQLite is stored in the platform application-data directory:

- Linux: `$XDG_DATA_HOME/gambalator`, or `~/.local/share/gambalator`.
- Windows: `%LOCALAPPDATA%\Gambalator`.

Set `GAMBALATOR_DATA_DIR` to use another location while developing or testing.

The same SQLite file contains three main data areas: `calculator_state` stores the
authoritative JSON state (including manual entries), `donations` stores the normalized
DonationAlerts ledger, and `sync_state` stores cursors, Auto-Chat, and the oldest
completed historical scan. Manual entries are not duplicated into `donations`.

## Checks

```bash
mise run backend-check
```
