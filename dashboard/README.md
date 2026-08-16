# Meridian Analytics Dashboard

Read-only local analytics for the Meridian DLMM agent.

## Safety boundary

- Binds to `127.0.0.1` by default.
- Reads only allowlisted Meridian JSON and JSONL sources during ingestion.
- API handlers query SQLite only.
- No trading, wallet, config, or mutation endpoints exist.
- Runtime data and SQLite files are ignored by Git.

## Requirements

- Node.js 20 or newer
- npm

## Setup

```bash
npm install
npm run migrate
npm run backfill
npm test
npm run typecheck
npm run build
npm start
```

The API listens on `http://127.0.0.1:4310` by default.

## Environment

- `DASHBOARD_DB`: SQLite path. Default: `data/analytics.sqlite`
- `MERIDIAN_ROOT`: Meridian repository path for backfill. Default: `..`
- `DASHBOARD_HOST`: loopback host only. Default: `127.0.0.1`
- `DASHBOARD_PORT`: API port. Default: `4310`

## Data meaning

`pnl_usd` already includes observed fees. Do not add `fees_earned_usd` to PnL. Account costs and post-close swaps are not included. The performance chart is cumulative realized closed-position PnL, not account equity.

See `../ANALYTICS_SOURCE_CONTRACT.md` and `../ANALYTICS_UI_DESIGN_CONTRACT.md` for the governing contracts.
