# Phase 4 — Adaptive profiles (settings and hiring signals)

This is the first Phase 4 change. Structured Projects, covers, ordering, and project moderation are the next change. Local demo sign-in still works through plain `npm run dev`; this does not turn on verified email sign-in or deploy to a hosted service.

## Try it in development

1. Sign in with an existing local test account under `npm run dev`, or use `npm run dev:demo` and its fictional personas. Go to **Settings → Edit Profile**.
2. Turn on **Open to hiring**, **Available for work**, both, or neither. A hiring profile can be company-only: it needs no portfolio, GitHub, or hourly rate. Company details are optional; the website must use HTTPS. Availability can show a whole hourly amount and a currency (USD, EUR, or GBP). An empty amount omits the rate. Switching an intent off hides its details without discarding them.
3. View `/f/<handle>` in a signed-out browser. A hiring-focused profile opens on **Leads**; **Threads** and **Solved** remain available. A person who's also available for work shows both signals and their usual reputation details. These settings don't change permission to post leads, bid, or review.
4. Submit a lead and switch to the fictional reviewer to publish it. The private submission alone never changes public activity. An open, published, non-removed lead in the public marketplace shows **Currently hiring** while it accepts bids. After the deadline or award, the profile shows **Open to hiring** only if declared.

## Contracts and privacy

- Migration `0009_adaptive_profile_settings` adds two independent options (both false by default), a company website, and an optional hourly pair. It preserves existing IDs, roles, sessions, and the Phase 3 company name. No company names are published by the migration.
- `PATCH /api/me` accepts partial settings with the existing profile fields. The hourly pair is either absent or complete: one component can be changed on an existing pair, and an explicit `null` clears the pair. PostgreSQL also enforces the pair and its bounds (1–10,000,000 whole units). Company name is at most 100 characters; `null` clears optional company fields. Invalid fields return `422` with `fields`. Identity, role, moderation state, and derived counts are not writable here. `GET /api/me` remains a minimal session probe.
- Only a deliberate company-name edit marks the saved name as eligible for public display; enabling the hiring toggle alone never opts a Phase 3 intake name in. The editor receives only its editable profile fields, not intake-only data. Public company details are shown only while **Open to hiring** is enabled. Public rates are shown only while **Available for work** is enabled. The hover-card response does not include these settings or provider identity information. Company sites are linked, not fetched or verified.
- Public lead totals and the **Leads** tab use the same publication and space visibility rules for everyone, including the owner and moderators. **New Poster** means exactly one visible public listing. The accepting-bid count excludes expired or already awarded listings. **Completed** counts recorded completions with a consistent winning pitch, without identifying the pitch or bidder. No payment verification or award-rate percentage is claimed.

## Verification

```sh
npm run test:db -- --profiles-only    # disposable 0008 → 0009 upgrade + normal npm run dev
npm run test:db -- --local-demo-only  # existing local demo-account regression
npm run test:db                       # includes the prior marketplace and fake email-provider checks
```

The profile tests cover the four intent combinations, validation and concurrent rate edits, explicit company visibility and clearing, private lead/count and pitch boundaries, and a single account both publishing a lead and bidding on another. The provider-double rehearsal also checks that intake-only company metadata is absent from the signed-in settings/profile payloads. Use only fictional data; no hosted credentials are needed.
