# Gambalator

Desktop-only Russian-language round calculator. Gambalator processes an ordered list of contributions, splits it into fixed-value RUB rounds, and records the largest contributor in each completed round.

The application is fully static: all data stays in the browser's `localStorage`, and the production build is suitable for GitHub Pages.

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

## Quality checks

```bash
mise run check
```

This runs type checking, linting, tests, and the production build.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` checks and deploys the `dist` artifact after a push to `main`. In the repository settings, select **GitHub Actions** as the Pages source.

The Vite base path is `/gambalator/`, matching a repository named `gambalator`.

See [PRD.md](./PRD.md) for the complete product specification.
