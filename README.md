# SLOP

SLOP is a Chrome extension that recommends AI tools from user context without launching or operating third-party tools. This repository contains:

- `extension/`: Manifest V3 Chrome extension with a Shadow DOM liquid-glass overlay, privacy disclosure, URL/title/meta-only automatic detection, manual/advanced task input, suggested prompts, client-side filters, recommendation detail/proceed flow, notification state, metrics events, and saved-tools memory.
- `backend/`: dependency-free Node.js backend API with tiered context classification, optional LLM provider delegation, shared durable JSON cache/database adapters for local development, tool database seed data, rate limiting, install guidance, metrics, and privacy-safe usage events.
- `docs/deployment-protocol.md`: the product and engineering Deployment Protocol v1.0.

## Run the backend

```bash
npm run backend
```

The backend listens on `http://localhost:8787` by default. Local development state is stored at `backend/data/slop-db.json` unless `SLOP_DB_PATH` is set. That JSON file is intentionally ignored by git; production deployments should point the same persistence boundaries at Postgres and Redis-compatible services.

## Optional LLM provider

The backend is backend-mediated by design. If `SLOP_LLM_ENDPOINT` and `SLOP_LLM_API_KEY` are configured, Tier 2 classification and install guidance call that provider and expect JSON responses. Without those variables, the backend uses deterministic local fallbacks so development and tests remain offline and repeatable.

## Load the extension

1. Open Chrome Extensions.
2. Enable Developer Mode.
3. Choose **Load unpacked** and select the `extension/` directory.
4. Start the backend locally before requesting recommendations.
5. Open the bell and acknowledge the privacy disclosure before automatic detection runs.

## Validate protocol coverage

```bash
npm test
```
