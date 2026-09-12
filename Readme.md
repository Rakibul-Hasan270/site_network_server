# Guest Posting Marketplace — API

## Setup

```bash
npm install express cors dotenv mongodb
cp .env.example .env   # fill in DB_USER / DB_PASS
node seed.js            # populates the "websites" collection (once)
node index.js           # starts the API on http://localhost:9000
```

## Endpoint

`GET /api/websites`

| Query param | Type   | Default   | Notes                                                                 |
|-------------|--------|-----------|------------------------------------------------------------------------|
| `page`      | number | 1         | 1-based                                                                |
| `perPage`   | number | 150       | capped at 500                                                          |
| `sortBy`    | string | `default` | `default` \| `da_desc` \| `dr_desc` \| `traffic_desc` \| `price_asc` \| `price_desc` |
| `search`    | string | ``        | case-insensitive match against `domain`                                |
| `filters`   | string | `{}`      | **JSON-stringified** object, e.g. `{"niche":"Finance"}`                 |

Response shape:

```json
{ "rows": [ { "id": "...", "domain": "...", ... } ], "total": 123 }
```

## Files

- `index.js` — app entrypoint, mounts the router
- `db.js` — Mongo client/connection (unchanged connection logic from your original file)
- `routes/websites.js` — the `/api/websites` route
- `utils/filters.js` — turns the frontend's bucket strings (`"31 to 40"`, `"10k to 20k"`) and
  Yes/No filters into a MongoDB query, and maps `sortBy` to a sort object
- `seed.js` — one-time script to populate `websites` with sample data shaped exactly like the
  fake data the React clone was generating client-side. Run `node seed.js --force` to wipe and reseed.

## Next steps you'll likely want

- Add auth-gated pricing (`price` is currently public — hide/replace it for logged-out users
  server-side, not just visually, since the frontend's `Lock` gate is cosmetic only right now).
- Add write endpoints (`POST /api/websites`, `PUT`, `DELETE`) once you have an admin/publisher flow.
- Add validation (e.g. with `zod` or `joi`) on the filter values before they hit MongoDB.