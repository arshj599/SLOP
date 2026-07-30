# SLOP

SLOP is a Chrome extension that recommends AI tools from user context without launching or operating third-party tools. This repository contains:

- `extension/`: Manifest V3 Chrome extension with a Shadow DOM liquid-glass overlay, privacy disclosure, privacy-safe URL/title automatic detection with client-side Tier 1 shortcuts, manual/advanced task input, suggested prompts, client-side filters, recommendation detail/proceed flow, notification state, feedback metrics events, configurable backend URL, settings/data reset controls, logo fallbacks, and saved-tools memory.
- `backend/`: dependency-free Node.js backend API with tiered context classification, optional LLM provider delegation, shared durable JSON cache/database adapters for local development, a maintainable Tier 1 domain table, cache-first automatic detection with neutral shared cache entries, LLM recommendation orchestration fallback paths, Postgres schema contract, canonical tool seed data, optional API-token auth, rate limiting, install guidance, metrics, and privacy-safe usage events.
- `docs/deployment-protocol.md`: the product and engineering Deployment Protocol v1.0.

## Run the backend

```bash
npm run backend
```

The backend listens on `http://localhost:8787` by default. Local development state is stored at `backend/data/slop-db.json` unless `SLOP_DB_PATH` is set. That JSON file is intentionally ignored by git; production deployments should point the same persistence boundaries at Postgres and Redis-compatible services. The Postgres table contract is in `backend/schema/postgres.sql`. Set `SLOP_API_TOKEN` to require clients to send the same token in `x-slop-token`. The extension defaults to `http://localhost:8787`, but the Settings panel can override the backend API URL for deployed environments.

## Optional LLM provider

The backend is backend-mediated by design. If `SLOP_LLM_ENDPOINT` and `SLOP_LLM_API_KEY` are configured, Tier 2 classification and install guidance call that provider and expect JSON responses. Without those variables, the backend uses deterministic local fallbacks so development and tests remain offline and repeatable. Tier 3 recommendation generation is backend-mediated through `llmJson` when a provider is configured and falls back to deterministic ranking when offline.

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

## Protocol completeness notes

The implementation includes MVP, Beta, and GA protocol surfaces: manual and advanced inputs, Shadow DOM liquid-glass cards/detail/proceed/save flows, notification badge state, privacy disclosure, automatic detection with 4-second dwell and domain-change debounce, a client-side Tier 1 shortcut table, a cache-first preflight that never invokes an LLM, a server-side Tier 1 domain table, neutral shared cache entries that are personalized after retrieval, Tier 2 classification, Tier 3 recommendation orchestration, saved-tool applicability flags, settings to disable automatic detection for Manual Input Mode, relevance/dismissal telemetry, and success-metric event capture. Production deployments should replace the default local JSON adapter with Postgres/Redis-compatible adapters using the schema in `backend/schema/postgres.sql`.
