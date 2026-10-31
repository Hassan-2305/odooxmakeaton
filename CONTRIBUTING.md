# Contributing

## Branches

- `main` is always deployable. Never commit directly to it.
- Branch off `main` for every change, named `<type>/<short-description>`:
  - `feat/subscription-plans`
  - `fix/invoice-rounding`
  - `chore/bootstrap-monorepo`
- Keep branches short-lived and rebase on `main` before opening a PR.
- Never force-push to `main` or to a branch someone else is working on.

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `test:`, `docs:`.
- One feature per commit. Don't mix unrelated changes.
- Never commit `.env` or any secrets. Add new variables to `.env.example` instead.

## Pull requests

1. Open a PR against `main` with a clear title (same format as a commit message).
2. In the description, say what changed, why, and how to test it manually.
3. Before requesting review, make sure these all pass locally:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```
4. At least one approving review is required before merging.
5. Squash-merge, then delete the branch.

## Code rules

- Money is always integer paise, never floats.
- API layering: routes → zod validation → auth middleware → services → repositories → DB.
  Business rules live in services only.
- Validate input with the shared zod schemas in `packages/shared`, on both api and web.
- Any service that touches money needs Vitest tests.
