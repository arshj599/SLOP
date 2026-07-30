# SLOP — AI Tool Recommendation Extension
## Deployment Protocol v1.0

**Document type:** Product & Engineering Deployment Protocol
**Purpose:** Finalize architecture, UI, feature behavior, cost strategy, and success metrics for Slop, a Chrome extension that recommends AI tools based on user context, without launching or operating those tools itself.
**Status:** All open questions from the original design notes have been resolved below with explicit decisions. Decisions made on Slop's behalf are marked **[DECISION]** so they can be challenged before build starts.

---

## 0. Product Summary

Slop is a Chrome extension that acts as a contextual recommendation layer for AI tools. It does not execute, launch, or integrate with any third-party tool. Its sole function is:

1. Detect (or receive) what task the user is trying to accomplish.
2. Query an LLM to produce a ranked shortlist of AI tools suited to that task.
3. Present that shortlist in an overlay UI.
4. On selection, show tool details, then a link + install/setup guidance.
5. Track which tools the user has actually adopted, and weight future recommendations accordingly.

Slop is explicitly a "GPT wrapper" — its value is context detection, curation, formatting, and workflow guidance, not model capability.

---

## 1. System Architecture Overview

```text
[Chrome Extension Client]
   ├─ Content Script (Shadow DOM overlay, liquid-glass UI)
   ├─ Background Service Worker (state, API calls, storage sync)
   └─ chrome.storage (local + synced saved-tools list)
        │
        ▼
[Slop Backend API] (required — do not call LLM directly from client)
   ├─ Auth / rate limiting
   ├─ Shared Recommendation Cache (Redis or equivalent)
   ├─ Tool Database (Postgres) — canonical AI tool metadata, ratings, cost, complexity
   ├─ LLM Orchestration Layer
   │    ├─ Tier 1: local/rules classifier (no LLM call)
   │    ├─ Tier 2: cheap-model URL/task classification
   │    └─ Tier 3: full-model recommendation generation + formatting
   └─ Analytics/Success-Metrics Logging
```

**[DECISION]** All LLM calls route through a Slop-owned backend, never directly from the extension. This is required for hiding API keys, enforcing rate limits, and enabling the shared cache described in Section 3. Without a backend, the cost problem in Section 3 cannot be solved.

---

## 2. Context Detection Strategy & Cost Control (Primary Open Question — Resolved)

### 2.1 The problem

Continuously reading the screen (screenshots, DOM text extraction, or vision-model calls) to infer user intent is the single largest cost driver in this product. Vision/DOM-based context inference on every page view or every N seconds scales linearly with active usage and becomes the dominant cost line item.

### 2.2 Options evaluated

| Option | Cost | Accuracy | Permissions needed |
|---|---|---|---|
| Continuous screen/DOM reading | High (vision tokens per page, per interval) | Highest | Broad (`<all_urls>`, DOM access) — hurts store review & user trust |
| URL-only reading | Low (text tokens, event-driven only) | Medium — good for well-known domains, weaker for generic ones | Minimal (`tabs` URL only) |
| Manual input only (user types task) | Lowest (one call per explicit request) | Highest (ground truth from user) | None beyond click handling |

### 2.3 **[DECISION] Recommended approach: Hybrid Tiered Detection**

**Tier 1 — Local heuristic table (no API call, $0 cost).**
A maintained local (and server-synced) lookup table maps common domains/paths directly to task categories without calling any model, e.g. `mail.google.com` → "email management," `figma.com` → "design," `docs.google.com` → "document editing." This covers the top ~200 domains by usage and should resolve the majority of visits with zero inference cost.

**Tier 2 — URL + lightweight metadata to a cheap/small model.**
When a domain isn't in the local table, send only the URL, page `<title>`, and meta description (plain text, no screenshots, no full DOM) to a small, cheap model to classify the likely task category. This is the "URL reading" the original notes proposed, confirmed here as the correct low-cost fallback — not full screen reading.

**Tier 3 — Manual / Advanced Search (user-triggered, exact input).**
The user explicitly types their task. This always produces the highest-quality recommendation and is the only tier that hits the full-capability model directly, because it's user-initiated and inherently rate-limited by human typing speed.

### 2.4 Shared cache (the actual cost lever)

**[DECISION]** Recommendation results are cached server-side, keyed by normalized `(domain + path-pattern + task-category)`, and shared across *all users*, not per-user. If User A on `outlook.com/mail` triggers a Tier 2/3 call, the resulting recommendation set is cached and served to User B on the same domain/task without a second LLM call. Cache entries expire and refresh on a fixed interval (default: 7 days) to keep tool rankings current.

### 2.5 Trigger rules (avoid polling)

- No interval-based polling of the page.
- A new detection cycle fires only when: (a) the top-level domain changes, AND (b) the user has been on the page for a minimum dwell time (default 4 seconds), AND (c) no cached result exists for that domain/task.
- Manual task entry and Advanced Search always bypass dwell/debounce rules since they are explicit user actions.

### 2.6 Success metrics — Context Detection

| Metric | Target |
|---|---|
| Avg. LLM cost per daily active user | < $0.01/day |
| Cache hit rate (Tier 2/3 requests served from cache) | > 70% after 30 days of usage data |
| Tier 1 (free) resolution rate | > 50% of all detection events |
| Median detection latency (URL change → recommendations shown) | < 1.5s cached / < 4s uncached |

### 2.7 Fallback protocol

If, after a pilot period, hybrid detection accuracy is judged too low or costs still exceed target, **[DECISION]** the system degrades gracefully to Manual Input Mode: automatic detection is disabled entirely, the left-panel task-entry button becomes the primary and only trigger, and all other downstream features (cards, flip detail, proceed flow, saved tools) remain unchanged. This requires no architectural rework — Tier 3 already is that mode.

---

## 3. UI/UX Specification

### 3.1 Visual system

- **Style:** Translucent "liquid glass" overlay — background blur + low-opacity panel fill, similar in behavior to system-level overlays (e.g., Fluey-style always-on-top glass panels).
- **Rendering:** Injected via content script into a Shadow DOM root to avoid CSS collisions with host pages.
- **Position:** Fixed overlay, does not scroll with page content. Two-panel split: left (input/control) and right (recommendations).
- **Dismissal:** Overlay is collapsible to a single small floating notification icon (see 3.4) so it never permanently blocks page content.

### 3.2 Left panel (control/input side)

Components, top to bottom:

1. **Task Input button** — opens a text field for the user to type their task in natural language (e.g., "I need help filtering emails").
2. **Suggested prompts list** — auto-generated short prompt suggestions based on current URL/task category (from Tier 1/2 detection), shown as tappable chips that pre-fill the Task Input.
3. **Filter button** — opens filter controls (Section 4.9).
4. **Advanced Search button** — opens a more detailed input for the user to state exactly what they're doing, bypassing approximation entirely (Section 4.10).

### 3.3 Right panel (recommendation side)

Two states:

**State A — List view (default):**

- Vertical scroll-wheel list of rectangular recommendation cards.
- Each card shows: tool logo (if available) or tool name in title-case formatting if no logo exists. No other detail is shown at this state.

**State B — Detail/"drop-down" view (after a card is clicked):**

- The selected card moves to the top of the panel and stays visible.
- A drop-down panel expands beneath it containing: description, star rating, user count, cost tier, complexity tier.
- A **"Back to list"** button sits at the bottom of the drop-down, returning the panel to State A.
- A **"Proceed"** button sits within the drop-down, advancing to State C.

**State C — Install/guidance view (after Proceed is clicked):**

- Right panel switches to numbered, step-by-step install instructions for the selected tool.
- An optional prompt invites the user to type their specific task again (if not already captured), so the guidance can be tailored (e.g., "Here's specifically how to use [Tool] to filter your Outlook inbox").
- At the bottom of the numbered instructions: an external link to the tool itself (opens in a new tab — Slop never embeds or launches the tool).
- A final **"Did you download?"** confirmation button (Section 4.6).

### 3.4 Notification button

A small persistent icon (bell-style) remains visible on the right edge of the screen at all times, even when the main overlay is collapsed. Clicking it expands the right panel to State A. This is the passive/ambient entry point for automatic recommendations that were generated in the background.

---

## 4. Feature-by-Feature Specification

Each feature below includes: Description, User Flow, Technical Requirements, and Success Metric.

### 4.1 Overlay & Panel System

**Description:** The core translucent two-panel UI injected on top of any webpage.
**User Flow:** Extension loads → collapsed notification icon shown by default → user or system expands panel → left/right layout renders.
**Technical Requirements:** Shadow DOM injection; z-index management to sit above host page content without blocking critical page interactions when collapsed; must not capture scroll/click events from the host page while collapsed.
**Success Metric:** < 100ms overlay render time on injection; 0 reported CSS-conflict bugs with top 50 target domains (Gmail, Outlook, Notion, Figma, GitHub, etc.) during QA.

### 4.2 Automatic Recommendation Engine

**Description:** Background system that infers task context (Section 2) and produces a ranked tool list without explicit user action.
**User Flow:** User navigates → domain change + dwell time triggers detection → cached or fresh recommendation set is generated → notification icon shows an "unread" badge → user opens panel.
**Technical Requirements:** Tiered detection pipeline (2.3), shared cache (2.4), debounce logic (2.5).
**Success Metric:** ≥ 60% of sessions with a domain change produce a usable (non-empty, category-matched) recommendation set within the latency targets in 2.6.

### 4.3 Recommendation Cards (List View)

**Description:** Rectangular cards in a scrollable list, showing tool logo/name only.
**User Flow:** User scrolls the right panel; clicks a card to open detail view.
**Technical Requirements:** Card data pulled from Tool Database (cached, not re-generated per render); lazy-load logos; graceful fallback to title-case text-only card when no logo asset exists.
**Success Metric:** Card click-through rate (cards clicked / cards shown) ≥ 15% as a baseline engagement target.

### 4.4 Card Flip / Drop-down Detail View

**Description:** Clicking a card reveals expanded details: description, rating, user count, cost, complexity.
**User Flow:** Click card → card animates to top → drop-down expands below with details → "Back to list" or "Proceed" chosen.
**Technical Requirements:** Detail fields sourced from Tool Database; must render even if some fields (e.g., user count) are unavailable — show "N/A" rather than blank.
**Success Metric:** < 300ms transition animation; drop-down abandonment rate (closed without proceeding) tracked as a baseline, target < 60%.

### 4.5 Proceed Button & Installation Guide Flow

**Description:** Converts a chosen recommendation into actionable numbered install/setup steps plus an external link.
**User Flow:** Click "Proceed" → right panel switches to numbered steps → optional task re-entry for tailored guidance → external link + "Did you download?" shown at the end.
**Technical Requirements:** LLM call (Tier 3-equivalent, single call) generates numbered install steps + tailored usage guidance based on tool + task; external link opens via `chrome.tabs.create`, never in-overlay.
**Success Metric:** ≥ 70% of users who click Proceed reach the final "Did you download?" step without abandoning mid-flow.

### 4.6 "Did You Download?" Confirmation & Persistent Tool Memory

**Description:** Self-reported confirmation that the user installed/adopted a tool. Stored to a per-user "saved tools" list used to bias future recommendations.
**User Flow:** User clicks "Did you download? → Yes" → tool added to saved-tools list (synced storage) → on future task detections, saved tools are included in the LLM prompt context so the model can judge fit and surface them first when relevant.
**Technical Requirements:** `chrome.storage.sync` (or backend-linked account storage) for the saved-tools list; every recommendation-generation call includes the user's saved-tools list as context so the model can re-rank/re-surface a previously adopted tool when it fits a new task.
**Success Metric:** ≥ 30% of previously saved tools get re-recommended (and accepted, i.e., clicked) for at least one subsequent, genuinely different task within 60 days.
**Known limitation (explicit, not solved):** This confirmation is self-reported; there is no reliable technical way to verify an external tool install (SaaS sign-up, extension install, desktop app) from the browser. This is accepted as a product tradeoff, not an engineering gap to close in v1.

### 4.7 Manual Task Input (Left Panel Button)

**Description:** Lets the user directly type their task instead of relying on automatic detection.
**User Flow:** Click Task Input → type free text (e.g., "I need help filtering emails") → submit → right panel populates with recommendations for that stated task.
**Technical Requirements:** Direct Tier 3 LLM call (bypasses Tier 1/2 entirely since this is explicit ground truth); still cache the result keyed by normalized input text + domain for reuse.
**Success Metric:** ≥ 90% of manual-input sessions return a non-empty, relevant recommendation set (measured via post-hoc relevance labeling or user thumbs-up/down).

### 4.8 Suggested Prompts (URL-based)

**Description:** Pre-written prompt chips shown on the left panel, derived from the current domain/task category, to reduce typing friction.
**User Flow:** User sees 2–4 chips relevant to the page they're on → clicking a chip pre-fills and submits the Task Input.
**Technical Requirements:** Sourced from the same Tier 1/2 classification already computed for the Automatic Recommendation Engine — no additional LLM call required.
**Success Metric:** ≥ 20% of Task Input submissions originate from a suggested prompt chip rather than free typing (indicates the shortcut is useful).

### 4.9 Filter System

**Description:** Left-panel control letting the user filter the current recommendation list by user count, installation cost, and complexity.
**User Flow:** Click Filter → select criteria (e.g., "Free only," "Beginner complexity," "Sort by user count") → right panel list re-sorts/re-filters client-side.
**Technical Requirements:** Filtering happens client-side against already-fetched Tool Database fields — no new LLM call needed per filter change.
**Success Metric:** ≥ 25% of sessions with 5+ recommendation results use at least one filter.

### 4.10 Advanced Search (Exact Task Input)

**Description:** A more explicit/detailed input mode for users who want to bypass approximate detection entirely and state exactly what they're doing.
**User Flow:** Click Advanced Search → detailed multi-field or long-text input → submit → full Tier 3 LLM call with maximum specificity.
**Technical Requirements:** Same pipeline as Manual Task Input (4.7) but with an expanded input schema (e.g., task, desired outcome, current tool if any, constraints).
**Success Metric:** Recommendation relevance (thumbs-up rate) for Advanced Search sessions ≥ relevance rate for automatic (Tier 1/2) sessions — i.e., it should measurably outperform approximation.

### 4.11 Notification Button

**Description:** Persistent icon indicating a new automatic recommendation set is ready.
**User Flow:** Background detection completes → badge appears on notification icon → click expands right panel to List View (State A).
**Technical Requirements:** Badge state stored in extension local state; cleared on panel open.
**Success Metric:** ≥ 40% notification-to-open rate (badge shown → panel opened within the same browsing session).

### 4.12 Saved Tools Re-Recommendation Logic

**Description:** On every new task/detection event, the saved-tools list is sent to the LLM alongside the new context so it can reason about whether a previously adopted tool is realistically a good fit and should be surfaced first.
**User Flow:** Transparent to the user — surfaces as a saved tool appearing at/near the top of a new recommendation list with a "You already use this" style indicator.
**Technical Requirements:** Saved-tools list included in every Tier 3 prompt payload; model instructed to rank a saved tool first only when genuinely applicable, not by default.
**Success Metric:** False-positive rate (saved tool surfaced but user rejects/ignores it) < 40%, tracked via click/dismiss behavior on saved-tool cards specifically.

---

## 5. Data Model (Storage Schema)

**Client-side (`chrome.storage.sync`):**

- `savedTools`: `[{ toolId, dateAdded, sourceTaskCategory }]`
- `userPreferences`: `{ defaultFilters, dismissedNotifications }`

**Backend (Postgres):**

- `tools` table: `id, name, logoUrl, description, rating, userCount, costTier, complexityTier, lastUpdated`
- `recommendation_cache` table: `cacheKey (domain+path+taskCategory), toolIds[], generatedAt, expiresAt`
- `usage_events` table (for success metrics only, no page content stored): `eventType, domain, taskCategory, timestamp, userIdHashed`

**[DECISION]** Raw page content, screenshots, and full DOM text are never stored or transmitted, in any tier. Only domain, path, page title/meta description (Tier 2 only), and explicitly user-typed task text (Tier 3) are ever sent off-device.

---

## 6. Privacy & Data Handling Protocol

- Manifest permissions request `tabs`/`activeTab` URL access only — no `<all_urls>` DOM scraping permission is requested for Tier 1/2 operation.
- Explicit user-typed input (Manual/Advanced Search) is the only case where free-text user content leaves the device, and this is inherently user-initiated and disclosed at the point of typing.
- Saved-tools list is user data tied to their account; must be deletable in one action from a settings panel (required for store compliance).
- **Success Metric:** 100% of data fields transmitted to backend are enumerated in a user-facing privacy disclosure before first use (Tier 1/2/3 fields listed explicitly, no undisclosed collection).

---

## 7. API Cost Control Protocol

1. **Model tiering:** Use a small/cheap model for Tier 2 classification; reserve the full-capability model for Tier 3 (explicit user input) and final recommendation-list formatting only.
2. **Shared cache-first:** Every Tier 2/3 call checks the shared cache (Section 2.4) before hitting the LLM.
3. **Rate limiting:** Per-user cap on Tier 3 calls per hour (default: 20/hour) to prevent runaway cost from rapid manual submissions or abuse.
4. **Batch cache refresh:** Cache expiry (Section 2.4) is refreshed lazily (on next request after expiry) rather than via scheduled background jobs, to avoid paying for refreshes nobody uses.

**Success Metric:** Total monthly LLM spend stays within a fixed per-DAU budget ceiling set at launch (recommend starting ceiling: $0.30/DAU/month, re-evaluated after 30 days of real cache-hit data).

---

## 8. Technical Stack Recommendation

- **Extension:** Manifest V3, content script (Shadow DOM UI), background service worker (API orchestration, storage sync).
- **Backend:** Any standard API framework capable of proxying LLM calls + Redis (cache) + Postgres (tool DB, usage events).
- **LLM access:** Backend-mediated only — API keys never shipped in the extension bundle.

---

## 9. Rollout Plan

| Phase | Scope | Exit criteria |
|---|---|---|
| MVP | Manual Task Input (4.7) + card list/detail/proceed flow (4.3–4.5) + saved tools (4.6) only. No automatic detection. | Core flow works end-to-end for 20 test domains; Proceed → Did You Download completion rate ≥ 70% (per 4.5 metric). |
| Beta | Add Tier 1/2 automatic detection (4.2), suggested prompts (4.8), filters (4.9), notifications (4.11). | Cost targets in Section 2.6 hit for a 100–500 user beta cohort. |
| GA | Add Advanced Search (4.10), saved-tools re-recommendation logic (4.12), full privacy disclosure UI (Section 6). | All success metrics in Section 10 met or explicitly re-baselined. |

**[DECISION]** Automatic detection (the costliest and riskiest feature) is deliberately deferred to Beta, not included in MVP. This lets the core recommendation/install/save loop be validated on manual input alone before any per-page-view cost is introduced.

---

## 10. Consolidated Success Metrics Table

| Feature | Metric | Target |
|---|---|---|
| Context Detection (2.6) | LLM cost/DAU/day | < $0.01 |
| Context Detection (2.6) | Cache hit rate | > 70% |
| Context Detection (2.6) | Tier 1 free-resolution rate | > 50% |
| Overlay & Panels (4.1) | Render time | < 100ms |
| Automatic Recommendation Engine (4.2) | Usable recommendation rate | ≥ 60% of domain-change sessions |
| Recommendation Cards (4.3) | Click-through rate | ≥ 15% |
| Detail View (4.4) | Transition time | < 300ms |
| Proceed/Install Flow (4.5) | Flow completion rate | ≥ 70% |
| Saved Tools (4.6) | Re-recommendation acceptance | ≥ 30% within 60 days |
| Manual Task Input (4.7) | Relevant-result rate | ≥ 90% |
| Suggested Prompts (4.8) | Chip usage share | ≥ 20% of submissions |
| Filters (4.9) | Usage rate | ≥ 25% of multi-result sessions |
| Advanced Search (4.10) | Relevance vs. automatic | Outperforms Tier 1/2 relevance |
| Notifications (4.11) | Open rate | ≥ 40% |
| Saved Tools Logic (4.12) | False-positive rate | < 40% |
| Cost Control (Section 7) | Monthly spend/DAU | ≤ $0.30 (re-baseline at 30 days) |
| Privacy (Section 6) | Disclosure completeness | 100% of transmitted fields disclosed |

---

## 11. Open Decisions Log

Every item below was ambiguous or unresolved in the original notes and has been explicitly decided above. Flag any of these for revision before build:

1. Screen-reading vs. URL-only vs. hybrid → **Hybrid tiered detection with shared caching** (Section 2).
2. Whether Slop needs its own backend vs. calling LLM from the client → **Backend required**, for cost and security reasons (Section 1).
3. Whether "did you download" is technically verifiable → **No; accepted as self-report** (Section 4.6).
4. Order of feature rollout → **Manual input first, automatic detection deferred to Beta** (Section 9).
5. Data retention scope → **URL/title/meta only for automatic tiers; free text only on explicit manual input; no screenshots/DOM ever** (Section 5–6).

---

*End of Deployment Protocol v1.0.*
