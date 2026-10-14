# Contributing to Trunk Slosh

Thanks for helping improve the game. This project follows [ROADMAP.md](ROADMAP.md) phases; pick the lowest open phase that matches your work.

## Setup

```bash
npm ci
npm run dev
```

Node **22** (see `.nvmrc`). Use `npm ci` when `package-lock.json` is present.

## Verify changes

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

GitHub Pages base path locally:

```bash
VITE_BASE_PATH=/trunk-slosh/ npm run build && npm run preview
```

## Branches & commits

- Branch names: `cursor/<short-description>` or feature branches off `main`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Reference GitLab/GitHub issues with `#123` in commit messages when applicable.

## Issue labels

Use phase labels when filing work: `phase-1` … `phase-30` (see [.github/labels.md](.github/labels.md)).

## Pull requests

Keep PRs focused on one phase or feature. Confirm CI is green (`test` + `build` + lint/typecheck).
