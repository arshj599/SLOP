# Persistence adapters

`backend/persistence.js` is the local JSON implementation used by tests and development. The runtime interface is intentionally small (`getTools`, `setCache`, `getCache`, `logUsage`, `allowRate`) so production can replace the local adapter without changing the API or extension protocol.

Production deployments should configure equivalent adapters with:

- Postgres for `tools`, `usage_events`, and durable `recommendation_cache` metadata.
- Redis or a Redis-compatible service for hot shared recommendation cache and rate-limit buckets.
- A stable `SLOP_HASH_SALT` so usage events store one-way-hashed user identifiers rather than raw extension IDs.

The SQL contract for the Postgres tables lives in `backend/schema/postgres.sql`. The local JSON adapter remains the default so protocol tests run offline and repeatably.
