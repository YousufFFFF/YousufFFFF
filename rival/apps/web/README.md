# RIVAL web

Next.js App Router. Two things live here:

- **`/`** — the marketing landing page.
- **`/admin`** — the admin dashboard.

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_URL
npm run dev -w @rival/web
```

The dashboard needs an account with `is_admin` set and a running API.

## Notes

- `NEXT_PUBLIC_API_URL` is the only value the browser bundle sees. Nothing
  secret belongs in a `NEXT_PUBLIC_` variable, and nothing secret is here.
- The dashboard signs in through the same API session as any other user; the
  `isAdmin` claim decides which tabs render, and the API enforces access
  independently — the UI hiding a tab is convenience, not the control.
- The landing page's phone mock-ups (`components/AppPreview.tsx`) render the
  same figures the seeded demo rivalry produces, so the marketing page shows the
  product as it behaves rather than an idealised version of it.
- `app/globals.css` holds the design tokens. The mobile app mirrors them in
  `apps/mobile/theme.ts`; change one, change both.
