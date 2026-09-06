# Gambalator

Desktop-only Russian-language round calculator. Gambalator processes an ordered list of contributions, splits it into fixed-value RUB rounds, and records the largest contributor in each completed round.

The application can run as a fully static browser application or with an optional local Python backend that imports DonationAlerts events. Manual application data stays in the browser's `localStorage`.

## Requirements

- [mise](https://mise.jdx.dev/)

## Local development

```bash
mise trust
mise install
mise run setup
mise run dev
```

Open the local URL printed by Vite.

## Local DonationAlerts application

A separate backend project lives in `backend/`; the legacy project under
`pscript/Only_DA-Goal` is not used or modified by it. Prepare and run the local
backend with:

```bash
mise run backend-setup
mise run local
```

`mise run local` builds the frontend and starts one local Python process that
serves both the page and the API. The application is available at
<http://127.0.0.1:5741>, so it can run alongside the legacy Python project on
port `5000`.

After the first-time setup, the same local mode can also be launched with one
script:

```bash
# Linux
./start-gambalator.sh

# Windows Command Prompt or PowerShell
.\start-gambalator.cmd
```

On Windows, `start-gambalator.cmd` can also be opened by double-clicking it.
Expand the
`DonationAlerts` panel to register and authorize a DonationAlerts application.
See [backend/README.md](./backend/README.md) for configuration, credential
storage, and API details.

While the local application is open, supported DonationAlerts donations are
automatically appended to the active queue. Each donation is saved in browser
storage before the backend marks it as imported. Temporary failures are retried
without duplicating rows. Unsupported currencies remain pending.

The DonationAlerts panel has an `Авто-Chat для новых донатов` switch.
While enabled, donations received by the backend are stored with their individual
nickname intact but enter the active queue with the golden `Chat` attribution enabled.
The switch is persisted by the backend and can also be controlled through its local API.

The connected DonationAlerts panel also supports confirmed reimport from a
selected Moscow date and time. It requeues previously stored backend records without
rewinding the DonationAlerts synchronization cursor. The time is entered explicitly
as 24-hour `ЧЧ:ММ`; the date opens in a dark calendar matching the application.
Restored DonationAlerts rows return to their chronological
calculation position using the original donation time rather than being appended as
newest rows.

The collapsed integration panel shows the two connection segments independently:
the web page to the local server, and the local server synchronizer to DonationAlerts.
Winner history can be opened in a wider dialog so long nicknames remain readable.
The manual donation form is also collapsed to one line by default and stays open
for rapid consecutive entry after the operator expands it.

## Open without a development server

Create a self-contained HTML file:

```bash
mise run build-single
```

Then open `dist-single/index.html` directly in a browser. The generated file contains the application code, styles, and logo, so it can be opened with a double-click or copied by itself. No server is required after the build.

## Quality checks

```bash
mise run check
```

This runs frontend and backend linting/tests plus the production build.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` checks and deploys the `dist` artifact after a push to `main`. In the repository settings, select **GitHub Actions** as the Pages source.

The Vite base path is `/`, matching the intended organization-site repository at
`gambalator.github.io`.

See [PRD.md](./PRD.md) for the complete product specification and
[AGENTS.md](./AGENTS.md) for a concise architecture and invariants guide for coding
assistants.

Russian operator documentation:

- [Windows installation and launch guide](./WINDOWS_INSTALL_RU.md)
- [Complete frontend user guide](./USER_GUIDE_RU.md)
- [Calculation and currency rules](./CALCULATION_LOGIC_RU.md)
