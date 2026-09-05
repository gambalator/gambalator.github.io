# Gambalator — Product Requirements Document

**Status:** Initial scope approved for implementation  
**Version:** 1.0  
**Date:** 2026-09-05

## 1. Product summary

Gambalator is a Russian-language, desktop-only webpage for dividing an ordered stream of viewer contributions into fixed-value rounds and identifying the participant with the largest total contribution in each completed round.

The application has no backend. It runs entirely in the browser, persists data locally, and is deployable as a static site on GitHub Pages.

## 2. Goals

- Let the user configure a round target and manually maintained EUR/RUB and USD/RUB exchange rates.
- Make adding contributions fast while allowing active entries to be edited, reordered, or removed.
- Process contributions in their displayed order into as many complete rounds as possible.
- Select exactly one result for every completed round: a nickname or `Chat` when the largest total is tied.
- Clearly distinguish consumed entries from entries still available for future rounds.
- Preserve the working state after a page refresh without requiring an account or backend.

## 3. Out of scope for the initial version

- A backend, accounts, authentication, or cross-device synchronization.
- Automatic/live exchange-rate retrieval.
- Mobile-specific layouts.
- Import, export, and collaborative editing.
- Undo/redo and restoring cleared data.
- Analytics beyond the per-round winner history.

## 4. Target user and platform

- A single operator using the tool on a desktop or laptop, including during a stream.
- The entire product interface is in Russian.
- The PRD and implementation documentation may be in English.
- The supported deployment target is GitHub Pages.

## 5. Page structure

The page contains two primary components.

### 5.1. Settings (`Настройки`)

- The settings component is collapsed by default into one summary line showing the large `Параметры расчёта` title, round target, and both exchange rates. Do not show a separate `Настройки` heading.
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
- Provide a `Сохранить курсы` button so the operator explicitly commits both rates together.
- Saved rates affect active foreign-currency entries the next time `РАССЧИТАТЬ` is pressed.
- Existing consumed rows and result history never change when a rate changes.
- Rate inputs are visually larger than ordinary compact fields. Do not show a redundant `1 RUB = 1 RUB` row.
- `Текущая сумма раунда`, `Курсы валют`, and `Стоимость одной единицы в рублях` use prominent, readable text.

### 5.2. Contributions and calculation

This component contains the fast-entry form, contribution list, calculation controls, and result history.

Its visible section title is `Очередь донатов`; do not show a separate `Взносы` heading.

#### Fast-entry form

Fields, in order:

1. `Никнейм` — text input.
2. `Сумма` — positive numeric input with one decimal place.
3. `Валюта` — enum select with `RUB`, `USD`, and `EUR`; default `RUB`.
4. `ДОБАВИТЬ` — submit button with prominent text.

Pressing Enter from the form has the same effect as pressing `ДОБАВИТЬ`. After a successful addition, the inputs clear and currency returns to `RUB`; keyboard focus returns to the nickname field.

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
- Can be edited inline, reordered via drag-and-drop, or removed.
- May only be reordered within the active part of the list.

Consumed rows:

- Use a visibly pale style while retaining readable contrast.
- Do not show a visible `Использовано` status word inside each row; use larger nickname, amount, and round text instead.
- Are locked: they cannot be edited, reordered, or individually removed.
- Appear below the active rows in their historical processing order.
- Are collapsed by default into a single `Использованные записи` title line and can be expanded or collapsed by the user.
- Show a visible sequence number when expanded.

Controls below or beside the list:

- `РАССЧИТАТЬ` — process all complete rounds currently available using a large, prominent label.
- `Удалить использованные` — remove all pale consumed rows after confirmation; result history remains.
- `Очистить все записи` — remove all active and consumed contribution rows after confirmation; result history and settings remain.

#### Result history

The section title is `История победителей`.

Show one immutable result item per completed round, in chronological order:

- Each item has a visible sequence number and uses large winner-name text.

- `Гамбашар 1 — name1 — 3000.0 RUB`
- `Гамбашар 2 — name4 — 4000.0 RUB`
- For a tie: `Гамбашар 3 — Chat — 2000.0 RUB`

Repeated winners appear once for every round they win. The control `Очистить историю` removes all result items after confirmation and restarts numbering at Round 1. It does not modify entries or settings.

The `Очистить историю` control uses the same readable text scale as the other list actions.

For a `Chat` result, do not display the tied nicknames. The displayed amount is the equal highest aggregated contribution in that round.

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
- If the original entry used USD or EUR, keep reference text on each derived row, such as `Исходная запись: 100.0 USD по курсу 85.5`.
- The active RUB remainder is frozen at the saved rate used during splitting; subsequent exchange-rate changes do not revalue it.
- If a foreign-currency entry is untouched because it belongs entirely to an incomplete round, it stays in its original currency and is converted again using the saved rate on the next calculation.

Example: `100.0 USD` at `85.5` equals `8550.0 RUB`. If `5000.0 RUB` is needed to complete a round, the row becomes a pale `5000.0 RUB` portion and an active `3550.0 RUB` remainder, both retaining the original USD reference.

### 6.4. Winner selection

- Within each completed round, aggregate all allocated portions by normalized nickname.
- Normalize nicknames by trimming surrounding spaces and comparing case-insensitively.
- Preserve and display the spelling from the first matching entry.
- Do not merge visually similar but different characters, such as Latin `A` and Cyrillic `А`.
- The nickname with the largest aggregated RUB contribution wins the round.
- If two or more nicknames share the exact largest value at one-decimal RUB precision, the result is `Chat`.
- There is exactly one result item for every completed round.

### 6.5. Reference example

Round target: `5000.0 RUB`.

| Order | Nickname | Contribution |
| ---: | --- | ---: |
| 1 | name1 | 3000.0 RUB |
| 2 | name2 | 1000.0 RUB |
| 3 | name3 | 1000.0 RUB |
| 4 | name4 | 4000.0 RUB |
| 5 | name5 | 1000.0 RUB |

Expected results:

1. `Гамбашар 1 — name1 — 3000.0 RUB`
2. `Гамбашар 2 — name4 — 4000.0 RUB`

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
- Data is local to the current browser and device; the interface should state this briefly near the bulk-clear controls.
- If stored data is corrupt or incompatible, preserve it where feasible, show a Russian recovery message, and offer to start with an empty list while retaining recoverable valid settings.

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

- Static frontend only; no runtime server, database, secret keys, or external API dependency.
- Build to Vite's `dist` directory with the GitHub Pages repository base path `/gambalator/`.
- Deploy on pushes to `main` through GitHub Actions and the official GitHub Pages artifact workflow.
- GitHub Actions installs the toolchain through `jdx/mise-action`, runs `mise run check`, and deploys `dist` only after the checks succeed.
- Do not add client-side routing in the initial version; the application has one URL and one page.

### Implementation constraints

- Keep calculation logic in a pure TypeScript domain module, isolated from React and browser APIs.
- Use decimal-safe integer arithmetic internally, representing RUB tenths as integers, to avoid floating-point boundary and tie errors.
- Keep persistence in a separate adapter so domain tests do not require `localStorage`.

## 11. Acceptance criteria

The first version is acceptable when all of the following are true:

1. On first visit, the round target is `5000.0 RUB`, EUR is `100.0`, USD is `85.5`, and new-entry currency is `RUB`.
2. The user can quickly add a valid row with the button or Enter.
3. The user can edit, remove, and drag active rows into a new order.
4. Consumed rows are pale, explicitly marked, fixed, and locked.
5. The reference example produces `name1` for Round 1 and `name4` for Round 2.
6. Overflow is carried into later rounds and a single nickname can win multiple rounds.
7. A partially consumed entry is automatically split into consumed RUB portion(s) and an active RUB remainder.
8. Multiple rows for the same normalized nickname are combined within each round.
9. An exact tie for the largest aggregated contribution produces `Chat` without exposing the tied nicknames.
10. An incomplete final round produces no result and its unconsumed entries or portions remain active.
11. Changing the target or rates does not modify historical results or consumed rows.
12. Refreshing the page restores all saved settings, entries, ordering, statuses, source references, and results.
13. `Удалить использованные`, `Очистить историю`, and `Очистить все записи` perform only their documented scopes and request confirmation.
14. All user-facing text is Russian and the application deploys successfully to GitHub Pages.
