# Premium Corporate Security Website

Standalone Next.js + TypeScript landing page for a premium corporate security company.

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Admin Connection

Panter AI sends completed quotation, recruitment, and inspection requests to the backend endpoint:

```text
POST /api/panter/requests
```

The website reads the backend URL from `NEXT_PUBLIC_API_URL` (or optional `NEXT_PUBLIC_PANTER_API_URL`). Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

See the root `README.md` for the full environment variable list.

Admin request management is available at:

```text
http://localhost:3000/admin
```

Use an existing backend admin account to sign in.

## Edit Content

Most replaceable text, navigation labels, services, statistics, references, FAQ items, and contact details live in:

```text
content/site.ts
```

The placeholder logo is rendered in the navigation and footer. The hero image is currently a placeholder background in `components/LandingPage.tsx` and can be replaced with company imagery later.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```
