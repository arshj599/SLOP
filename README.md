# SLOP

SLOP is a Chrome extension that recommends AI tools from user context without launching or operating third-party tools. This repository contains:

- `extension/`: Manifest V3 Chrome extension with a Shadow DOM liquid-glass overlay, manual/advanced task input, suggested prompts, filters, recommendation detail/proceed flow, notification state, and saved-tools memory.
- `backend/`: dependency-free Node.js backend API with tiered context classification, shared cache, tool database seed data, rate limiting, install guidance, and privacy-safe usage events.
- `docs/deployment-protocol.md`: the product and engineering Deployment Protocol v1.0.

## Run the backend

```bash
npm run backend
```

The backend listens on `http://localhost:8787` by default.

## Load the extension

1. Open Chrome Extensions.
2. Enable Developer Mode.
3. Choose **Load unpacked** and select the `extension/` directory.
4. Start the backend locally before requesting recommendations.

## Validate protocol coverage

```bash
npm test
```
