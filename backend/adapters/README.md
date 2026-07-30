# Persistence adapters

`backend/persistence.js` is the local JSON implementation used by tests and development. Production deployments should implement this same interface with:

- Postgres for `tools`, `usage_events`, and optional durable `recommendation_cache` metadata.
- Redis or a Redis-compatible service for hot shared cache and rate-limit buckets.

The SQL contract for the Postgres tables lives in `backend/schema/postgres.sql`.
