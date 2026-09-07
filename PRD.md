# Gambalator — Product Requirements Document

**Status:** Static application implemented; local DonationAlerts integration in progress
**Version:** 1.1
**Date:** 2026-09-06

## 1. Product summary

Gambalator is a Russian-language, desktop-only webpage for dividing an ordered stream of viewer contributions into fixed-value rounds and identifying the participant with the largest total contribution in each completed round.

The core calculator can run entirely in the browser, persists data locally, and is deployable as a static site. An optional local Python companion service provides reliable DonationAlerts synchronization without requiring public hosting.

## 2. Goals

- Let the user configure a round target and manually maintained RUB conversion rates for every currency documented as DonationAlerts API output.
- Make adding contributions fast while allowing active entries to be edited, reordered, or removed.
- Process contributions in their canonical queue order into as many complete rounds as possible.
- Show the largest contributor for every completed round, or all tied nicknames when multiple contributors share the largest total.
- Clearly distinguish consumed entries from entries still available for future rounds.
- Preserve the working state after a page refresh without requiring an account or backend.
- When the optional local service is running, recover DonationAlerts donations received while Gambalator was offline and import each donation at most once.

## 3. Out of scope for the initial version

- Publicly hosted backend services, Gambalator accounts, or cross-device synchronization.
- Automatic/live exchange-rate retrieval.
- Mobile-specific layouts.
- Import, export, and collaborative editing.
- Undo/redo and restoring cleared data.
- Analytics beyond the per-round winner history.

## 4. Target user and platform

- A single operator using the tool on a desktop or laptop, including during a stream.
- Development and local runtime must support Linux and Windows; client packaging is a later decision.
- The entire product interface is in Russian.
- The PRD and implementation documentation may be in English.
- The supported deployment target is GitHub Pages.
- A separate single-file build produces a self-contained HTML document that can be opened directly without a local server.

## 5. Page structure

The page contains two primary components.

The header uses the project artwork as its logo inside a prominent pink frame, preserving the rounded corners, slight tilt, and shadow.

### 5.1. Settings (`Настройки`)

- The settings component is collapsed by default into one summary line showing the large `Параметры расчёта` title, round target, and both exchange rates. Do not show a separate `Настройки` heading.
- Place the collapsed settings component last in the page's main content, after the donation workspace.
- The summary line expands and collapses the settings controls.

#### Round target

- Show the active value as `Текущая сумма раунда`.
- Default: `5000.0 RUB`.
- The expanded round-target card has two visual rows: the current sum on the first, followed by the new-value input and `Обновить` button on the second.
- A valid update affects only future calculations. Existing consumed rows and result history do not change.

#### Exchange rates

Use a compact, directly editable rate table rather than unlabeled standalone fields:

- `1 EUR = [100.0] RUB`
- `1 USD = [85.5] RUB`
- Additional collapsed rates: `1 BYN = [28.2] RUB`, `100 KZT = [19.0] RUB`, `10 UAH = [19.4] RUB`, `1 BRL = [17.0] RUB`, `10 TRY = [17.9] RUB`, `1 PLN = [23.2] RUB`, `10000 UZS = [73.1] RUB`.
- Provide a `Сохранить курсы` button so the operator explicitly commits both rates together.
- Saved rates affect active foreign-currency entries the next time `РАССЧИТАТЬ` is pressed.
- Existing consumed rows and result history never change when a rate changes.
- Rate inputs are visually larger than ordinary compact fields. Keep EUR and USD visible, and hide BYN, KZT, UAH, BRL, TRY, PLN, and UZS under `ОТКРЫТЬ ВСЕ ВАЛЮТЫ` by default. Do not show a redundant `1 RUB = 1 RUB` row.
- `Текущая сумма раунда`, `Курсы валют`, and `Стоимость указанного количества в рублях` use prominent, readable text.

### 5.2. Contributions and calculation

This component contains the fast-entry form, contribution list, calculation controls, and result history.

Use centered, inset divider lines between the fast-entry form, active entries, calculation controls, and consumed-entry `ИСТОРИЯ`. Dividers must be visibly narrower than their containing content area.

Do not show a visible `Очередь донатов` or separate `Взносы` heading. Do not show active or consumed counter pills above the workspace.

#### Fast-entry form

The manual-entry section is collapsed by default into one line labelled `ДОБАВИТЬ ДОНАТ ВРУЧНУЮ`, without a field-name summary. Expanding it reveals the complete form; after a successful addition it stays open and focuses the nickname field for the next entry.

Fields, in order:

1. `Никнейм` — text input.
2. `Сумма` — positive numeric input with one decimal place.
3. `Валюта` — enum select with `RUB`, `BRL`, `BYN`, `EUR`, `KZT`, `PLN`, `TRY`, `UAH`, `USD`, and `UZS`; default `RUB`.
4. `Chat` — a golden attribution toggle immediately before the add button; disabled by default.
5. `ДОБАВИТЬ` — submit button with prominent text.

Pressing Enter from the form has the same effect as pressing `ДОБАВИТЬ`. After a successful addition, the inputs clear, currency returns to `RUB`, and the `Chat` toggle returns to its disabled default; keyboard focus returns to the nickname field.

New donations are stored in chronological order for calculation, but the active queue is rendered in reverse chronological order. For entries added as `1, 2, 3, 4`, the visible list and its labels are `4, 3, 2, 1`. Round calculation continues to process the canonical chronological order `1, 2, 3, 4`, independent of the reversed presentation.

Field labels and empty-list guidance use comfortably large desktop text.

#### Contribution list

Each row shows:

- Drag handle.
- Nickname.
- Entered amount and currency.
- RUB equivalent when relevant.
- Status: active or consumed.
- Edit and remove actions when allowed.

Active rows:

- Use the normal foreground and background colors.
- Use large, prominent nickname and amount text and show a visible sequence number.
- Have a small vertical gap between adjacent rows.
- Give every row its own golden `Chat` toggle. When enabled, calculate that donation under the shared `Chat` nickname while retaining the typed nickname for identification and later editing.
- Give Chat-attributed rows a visible golden highlight.
- Can be edited inline, reordered via drag-and-drop, toggled between individual and Chat attribution, or removed.
- May only be reordered within the active part of the list.

Consumed rows:

- Use a visibly pale style while retaining readable contrast.
- Do not show a visible `Использовано` status word inside each row; use larger nickname, amount, and round text instead.
- Are locked: they cannot be edited, reordered, or individually removed.
- Appear below the active rows, grouped by decreasing `Гамбашар` number so the newest group is first; rows within each group retain their historical processing order.
- Appear below the calculation and cleanup buttons.
- Are collapsed by default into a single `ИСТОРИЯ` title line and can be expanded or collapsed by the user. Its counter shows the number of `Гамбашар` groups, not the number of consumed donation rows.
- Show a visible sequence number when expanded.
- Group expanded entries into visually distinct `Гамбашар` sections so nicknames from different rounds are clearly separated.
- Separate adjacent nickname rows within each `Гамбашар` section with a thin line.
- Mark donations that were attributed to `Chat` when calculated with a persistent golden `Chat` badge and subtle golden row highlight.
- Highlight the nickname whose aggregated contribution won each group; highlight every tied winner, and the `Chat` attribution marker when Chat won.
- Do not show decorative dots after entry numbers or at the end of consumed rows.

Controls below or beside the list:

- `РАССЧИТАТЬ` — process all complete rounds currently available using a large, prominent label.
- `Удалить использованные` — remove all pale consumed rows after confirmation; result history remains.
- `Очистить все записи` — remove all active and consumed contribution rows after confirmation; result history and settings remain.

#### Result history

The section title is `История победителей`.

Show one immutable result item per completed round in decreasing round order, with the newest result first:

- Each item uses large winner-name text and does not show a separate line-number badge.
- Render every round result as a visually separate row or card.
- Place `Гамбашар N` on its own subtitle line above the result row, leaving the row width for the winner nickname and amount. Allow long winner nicknames to wrap instead of hiding them.
- After a successful calculation, newly produced winners remain bright while all winners from earlier calculations become pale. A calculation that completes no rounds does not change history emphasis.

- `Гамбашар 1 — Chel_1 — 3000.0 RUB`
- `Гамбашар 2 — Chel_4 — 4000.0 RUB`
- For a tie: `Гамбашар 3 — Chel_2, Chel_3 — 2000.0 RUB`

Repeated winners appear once for every round they win. The control `Очистить историю` removes all winner result items after confirmation but does not modify entries or settings. The next round number continues after the highest round still present in either winner history or consumed-entry `ИСТОРИЯ`; numbering restarts at 1 only when both are empty.

The `Очистить историю` control uses the same readable text scale as the other list actions.

For a tied result, display every tied nickname in their first-appearance order. The displayed amount is the equal highest aggregated contribution in that round.

## 6. Calculation rules

### 6.1. Currency normalization

- `RUB` is the calculation currency.
- At calculation time, each active foreign-currency entry is converted with the latest saved rate.
- Converted values are rounded to one decimal RUB before round allocation and tie comparison.
- Once any part of an entry is consumed, its processed value is frozen and must not change after later exchange-rate updates.

### 6.2. Ordered round allocation

1. Read active entries from top to bottom.
2. Convert each entry to RUB as described above.
3. Allocate its RUB value into the current round until the configured round target is reached.
4. If an entry crosses a round boundary, allocate only the amount required to complete the current round and carry the remainder into the next round.
5. A sufficiently large entry may contribute to and win multiple rounds.
6. Continue until there is not enough active value to complete another round.
7. Finalize every complete round in one calculation action.
8. Do not finalize the last incomplete round. Rows or row portions belonging only to it remain active and use normal styling.

Calculation is transactional: pressing `РАССЧИТАТЬ` must either produce the full set of newly completed rounds and row transformations or leave the prior state unchanged if an unexpected error occurs.

### 6.3. Automatic splitting

When only part of an entry is consumed, automatically split its list representation:

- Create one pale, locked row for each portion assigned to a completed round.
- Keep the unconsumed remainder as a normal active row immediately after the consumed portion(s).
- Processed split portions are denominated in RUB so round boundaries remain mathematically exact at one-decimal precision.
- Show the full original donation amount and currency on every derived active and consumed row, including RUB donations.
- If the original entry used a foreign currency, keep the quoted unit and reference text on each derived consumed-history row, such as `Исходная запись: 100.0 USD по курсу 1 USD = 85.5 RUB`.
- The active RUB remainder is frozen at the saved rate used during splitting; subsequent exchange-rate changes do not revalue it.
- If a foreign-currency entry is untouched because it belongs entirely to an incomplete round, it stays in its original currency and is converted again using the saved rate on the next calculation.

Example: `100.0 USD` at `85.5` equals `8550.0 RUB`. If `5000.0 RUB` is needed to complete a round, the row becomes a pale `5000.0 RUB` portion and an active `3550.0 RUB` remainder, both retaining the original USD reference.

### 6.4. Winner selection

- Within each completed round, aggregate all allocated portions by normalized nickname.
- Attribute every entry with its enabled `Chat` toggle to the shared `Chat` nickname; multiple such entries are combined even when their typed nicknames differ.
- Normalize nicknames by trimming surrounding spaces and comparing case-insensitively.
- Preserve and display the spelling from the first matching entry.
- Do not merge visually similar but different characters, such as Latin `A` and Cyrillic `А`.
- The nickname with the largest aggregated RUB contribution wins the round.
- If two or more nicknames share the exact largest value at one-decimal RUB precision, list all of those nicknames in the result.
- There is exactly one result item for every completed round.

### 6.5. Reference example

Round target: `5000.0 RUB`.

| Order | Nickname | Contribution |
| ---: | --- | ---: |
| 1 | Chel_1 | 3000.0 RUB |
| 2 | Chel_2 | 1000.0 RUB |
| 3 | Chel_3 | 1000.0 RUB |
| 4 | Chel_4 | 4000.0 RUB |
| 5 | Chel_5 | 1000.0 RUB |

Expected results:

1. `Гамбашар 1 — Chel_1 — 3000.0 RUB`
2. `Гамбашар 2 — Chel_4 — 4000.0 RUB`

## 7. Validation and error handling

- Nickname is required after surrounding whitespace is trimmed.
- Contribution amount, new round target, and exchange rates must be greater than `0.0`.
- Numeric inputs accept at most one decimal place.
- No arbitrary maximum value is imposed.
- Reject `NaN`, infinity, negative numbers, zero, and malformed numeric text.
- Show concise inline validation messages in Russian next to the relevant field.
- Invalid forms cannot be submitted.
- `РАССЧИТАТЬ` is disabled when there are no active entries or settings contain unsaved/invalid changes.
- If the active entries cannot complete a round, keep all data unchanged and show a neutral Russian message explaining how much RUB is still needed.
- Calculation feedback messages automatically disappear after 10 seconds.
- Destructive bulk actions require a dark, in-app confirmation dialog that names exactly what will and will not be cleared.

## 8. Persistence

- Automatically save settings, rows and their states, ordering, source-currency references, and result history to browser `localStorage` after every successful mutation.
- Restore the complete saved state after refresh or browser reopening.
- Store a schema version so later releases can migrate persisted data safely.
- Saving must be scoped to Gambalator and must not use cookies.
- Data is local to the current browser and device; do not add explanatory storage text near the bulk-clear controls.
- If stored data is corrupt or incompatible, preserve it where feasible, show a Russian recovery message, and offer to start with an empty list while retaining recoverable valid settings.
- The optional Python service stores DonationAlerts synchronization cursors, normalized donations, and import acknowledgements in a local SQLite database.
- On its first connection, the service establishes the latest donation as its baseline by default and does not import the account's entire historical donation list.
- On later starts, it paginates through DonationAlerts history until it reaches the saved ID, allowing donations received during downtime to be recovered.

## 9. UX and accessibility requirements

- Optimize the layout for desktop widths; mobile optimization is not required in version 1.
- Keep the dark interface theme and use soft pink (`#FA75DB`) as the primary product color, with yellow and orange as secondary accents.
- Maintain clear visual separation between `Настройки` and `Взносы`.
- Keep the primary `РАССЧИТАТЬ` action visually prominent.
- Do not communicate consumed status through color alone; include a text label or status icon with an accessible name.
- All controls must be keyboard reachable and have visible focus states.
- Drag-and-drop supports keyboard operation; separate up/down arrow buttons are not shown.
- Confirmation dialogs must return focus predictably after canceling or completing an action.
- Use Russian number presentation consistently while accepting a period as the decimal input separator; display all monetary values with exactly one decimal place.

## 10. Technology stack and constraints

### Application stack

- React with TypeScript for the component UI and typed application model.
- Vite for local development and production builds.
- Plain CSS with CSS custom properties; no utility-CSS or component framework.
- React `useReducer` for application state; no external global-state library.
- Browser `localStorage` behind a versioned storage adapter.
- dnd-kit for sortable active rows through a drag handle.
- Vitest for the pure calculation engine and storage tests.
- React Testing Library for component behavior tests.
- ESLint and TypeScript type checking for static validation.
- npm for project dependencies, with `package-lock.json` committed.

### Toolchain management with mise

- Commit a project-level `mise.toml` and use mise to install and activate development tools.
- Use the Node.js 24 LTS release line and npm 11, with resolved versions locked for reproducible local and CI environments.
- A fresh checkout is prepared with `mise install`, followed by the mise setup task that runs `npm ci`.
- Expose the main workflows as mise tasks: `setup`, `dev`, `typecheck`, `lint`, `test`, `build`, and `check`.
- `mise run check` is the single local and CI quality gate and runs type checking, linting, tests, and a production build.
- npm remains responsible for installing React, Vite, and other application packages; mise is responsible for the Node/npm toolchain and consistent task entry points.

### Deployment and runtime

- The manual calculator remains available as a static frontend with no runtime server, database, secret keys, or external API dependency.
- Build to Vite's `dist` directory with the GitHub Pages organization-site base path `/`.
- Deploy on pushes to `main` through GitHub Actions and the official GitHub Pages artifact workflow.
- GitHub Actions installs the toolchain through `jdx/mise-action`, runs `mise run check`, and deploys `dist` only after the checks succeed.
- Do not add client-side routing in the initial version; the application has one URL and one page.

### Optional local DonationAlerts service

- Use Python 3.13, Flask, Waitress, Requests, and SQLite in an independent `backend` project.
- Poll the official `GET /api/v1/alerts/donations` endpoint with an OAuth token carrying the `oauth-donation-index` scope.
- Provide a collapsed Russian-language DonationAlerts panel that shows connection state and the exact loopback Redirect URI.
- Accept the application's App ID and API Key locally, open the DonationAlerts authorization page, validate the returned OAuth state, and exchange the temporary code through the Python service.
- Prefer the operating system's credential store for API Key, access token, and refresh token; clearly report when an unencrypted local-file fallback is used.
- Refresh expired access tokens without requiring the operator to repeat authorization.
- When DonationAlerts rejects an expired or revoked refresh token, distinguish it from a temporary connection failure and show `Требуется повторная авторизация`.
- Let the operator restart authorization with one button while reusing the locally saved App ID and API Key; do not redirect to DonationAlerts automatically at startup.
- After manual disconnection, represent a saved API Key with a masked placeholder and explanatory text without returning the secret to the browser.
- Provide an `Авто-Chat для новых донатов` toggle, disabled by default. Capture its state when the backend receives each new donation and import enabled donations with their row-level golden `Chat` toggle on.
- Persist automatic Chat attribution in SQLite, retain the captured value through delayed import and reimport, and do not change donations already received when the global toggle changes.
- Expose loopback REST endpoints to read, set explicitly, and invert automatic Chat attribution; synchronize external changes back to the visible toggle.
- Bind the HTTP service to `127.0.0.1` by default and never return the DonationAlerts token through its local API.
- Serve the built React application and local API from the same origin at `http://127.0.0.1:5741`, avoiding the legacy application's port `5000`.
- Keep the legacy `pscript/Only_DA-Goal` project unchanged and independent.
- Store runtime data in the operating system's application-data directory, with an environment override for development and testing.
- Keep unsupported currencies pending and identify them explicitly instead of silently converting them with a hardcoded rate.
- Use a persisted unique DonationAlerts ID for deduplication across polling, browser refreshes, and process restarts.
- Import supported pending donations into the active queue in their original chronological order, while retaining the reversed visual presentation.
- Persist an imported donation in browser storage before acknowledging it in the backend, and retry interrupted acknowledgements without creating duplicate rows.
- Allow the operator to preview and confirm reimport of acknowledged backend records from a Moscow date and time, without changing the DonationAlerts synchronization cursor.
- Use a project-styled dark calendar and explicit 24-hour `ЧЧ:ММ` Moscow-time field for reimport; never depend on the browser's native light calendar or AM/PM presentation.
- Exclude DonationAlerts source IDs still present in browser state from both the reimport preview count and the actual requeue operation, so a positive preview always represents restorable rows.
- Insert restored DonationAlerts rows into canonical calculation order using their original donation time and DonationAlerts ID tie-breaker, while preserving the relative order of existing and manual rows.
- Acknowledge imported DonationAlerts rows sequentially to avoid saturating the local Waitress request queue during a multi-row import.
- Offer quick reimport time selections for the last 10 minutes, last hour, the start of the current day, three days ago, and five days ago.
- Keep a visible `Веб-страница → Локальный сервер → DonationAlerts` connection map with an independent status for each link, including synchronization errors.
- Display healthy connection labels and their status dots in green.
- Hide a successful reimport completion notice automatically after five seconds.
- Allow the winner history to open from an icon-only expand button into a wide modal where long and tied winner names wrap without truncation.

### Implementation constraints

- Keep calculation logic in a pure TypeScript domain module, isolated from React and browser APIs.
- Use decimal-safe integer arithmetic internally, representing RUB tenths as integers, to avoid floating-point boundary and tie errors.
- Keep persistence in a separate adapter so domain tests do not require `localStorage`.

## 11. Acceptance criteria

The first version is acceptable when all of the following are true:

1. On first visit, the round target is `5000.0 RUB`; currency rates use the documented defaults; and new-entry currency is `RUB`.
2. The user can quickly add a valid row with the button or Enter.
3. The user can edit, remove, and drag active rows into a new order.
4. Consumed rows are pale, explicitly marked, fixed, and locked.
5. The reference example produces `Chel_1` for Round 1 and `Chel_4` for Round 2.
6. Overflow is carried into later rounds and a single nickname can win multiple rounds.
7. A partially consumed entry is automatically split into consumed RUB portion(s) and an active RUB remainder.
8. Multiple rows for the same normalized nickname are combined within each round.
9. An exact tie for the largest aggregated contribution lists every tied nickname.
10. An incomplete final round produces no result and its unconsumed entries or portions remain active.
11. Changing the target or rates does not modify historical results or consumed rows.
12. Refreshing the page restores all saved settings, entries, ordering, statuses, source references, and results.
13. `Удалить использованные`, `Очистить историю`, and `Очистить все записи` perform only their documented scopes and request confirmation.
14. All user-facing text is Russian and the application deploys successfully to GitHub Pages.
