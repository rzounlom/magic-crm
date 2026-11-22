# Phase 12K — Staff quote editor screenshots

Synthetic Test Center B inquiry only. Captured via `scripts/phase-12k-capture-quote-screenshots.ts` against `http://localhost:3000`.

| File | Notes |
|---|---|
| `before-quote-editor-{375,768,1440,1920}.png` | Pre-12K layout |
| `after-quote-editor-{375,768,1440,1920}.png` | Four-stage Staff quote layout |

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec tsx --tsconfig tsconfig.json scripts/phase-12k-capture-quote-screenshots.ts before
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec tsx --tsconfig tsconfig.json scripts/phase-12k-capture-quote-screenshots.ts after
```
