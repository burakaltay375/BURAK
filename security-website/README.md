# Premium Corporate Security Website

Standalone Next.js + TypeScript landing page for a premium corporate security company.

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

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
