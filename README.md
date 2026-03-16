# script-git-work

Clone GitHub repos, rewrite history, push to new repos, and change visibility.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your values
```

## Usage

| Command | Description |
|--------|-------------|
| `npm run clone` | Clone all public repos from a GitHub user into a local dir |
| `npm run replace` | Rewrite git history for cloned repos and push to new GitHub repos |
| `npm run release` | Set private repos to public when last update is after a given date |

## Features

### Clone (`npm run clone`)

- Fetches all public repos for `GITHUB_CLONE_USERNAME`
- Clones into `GITHUB_CLONE_DIR` (default `./repos`)
- Optional `FIRST_COMMIT_DATE` (ISO): only clone repos created after this date
- Optional `GITHUB_TOKEN`: higher API rate limits

### Replace (`npm run replace`)

- Reads repos from `GITHUB_REPLACE_DIR`
- Rewrites author/committer to `GITHUB_REPLACE_USERNAME` / `GITHUB_REPLACE_USEREMAIL`
- Pushes to new GitHub repos (creates if needed) using `GITHUB_REPLACE_TOKEN`
- `ADD_COMMIT_DELAY_SINCE_LAST_COMMIT_DAYS`: adds delay (days) since last commit in history
- `AUTO_REMOVE`: remove local repo after successful push

### Release (`npm run release`)

- Uses `GITHUB_RELEASE_TOKEN` (repo scope, admin on target repos)
- Targets private repos owned by `GITHUB_RELEASE_USERNAME` (user or org)
- Only repos with last update **after** `LAST_UPDATE_DATE` (ISO) are changed from private → public

## Env reference

See `.env.example`. All listed vars are required for the script that uses them (clone / replace / release).
