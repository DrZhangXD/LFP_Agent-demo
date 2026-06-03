# NeuroLFP Agent

A browser-based **Local Field Potential (LFP) / iEEG signal analysis** workbench for
BCI and epilepsy research, with an AI Analyst chat assistant. Built with React 19, Vite,
TypeScript, Recharts, and an HTML canvas — everything runs client-side, no backend
required.

**Live demo:** https://drzhangxd.github.io/LFP_Agent-demo/

## Features

- **Data sources** — synthetic LFP generator (hippocampal theta, motor beta, gamma bursts,
  IEDs, 60 Hz line noise) or upload your own `.edf` (European Data Format) recording. The
  sampling rate is read from the EDF header and threaded through the whole pipeline.
- **Real preprocessing pipeline** (applied to the time series, not faked):
  - Re-referencing: **Monopolar**, **Bipolar**, **Common Average (CAR)**, **Laplacian**.
  - **Notch filter** (50/60 Hz) — zero-phase RBJ biquad to remove power-line noise.
  - **Band-pass filter** with presets (Wide 0.5–300, LFP 1–150, Ripples 80–250 Hz).
  - Channel quality control and manual channel exclusion.
- **Feature extraction** — **Welch PSD** (Hann window, 50% overlap) and per-band relative
  power (Delta/Theta/Alpha/Beta/Gamma/High-Gamma) computed from the data.
- **Visualization** — stacked raw traces and a real **STFT spectrogram** (time–frequency).
- **AI Analyst** — multi-provider chat (Gemini / OpenAI / Anthropic / any OpenAI-compatible
  gateway) that receives a summary of the current analysis state as context.

## Project structure

```
App.tsx                  Top-level UI + the signal pipeline (processedData)
components/               Sidebar, RawTraceViewer, PSDViewer, SpectrogramViewer, AgentSidebar
services/
  dspService.ts          FFT, Welch PSD, band power, STFT spectrogram
  filterService.ts       IIR biquad notch/band-pass + CAR/Laplacian re-referencing
  edfService.ts          EDF parser (parseEDFBuffer is pure + unit-tested)
  mockDataService.ts     Synthetic LFP generator
  llmService.ts          Multi-provider LLM client
constants.ts             Frequency bands, system prompt
types.ts                 Shared types
```

## Run locally

**Prerequisite:** Node.js 20+

1. Install dependencies: `npm install`
2. Configure the LLM provider (optional — the analysis tools work without it):
   `cp .env.example .env.local` and fill in keys for your provider. See `.env.example`
   for the full list (`VITE_LLM_PROVIDER` plus the per-provider key/model variables).
3. Start the dev server: `npm run dev` (http://localhost:3000)

## Scripts

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Vite dev server                              |
| `npm run build`     | Production build to `dist/`                  |
| `npm run preview`   | Serve the production build locally           |
| `npm run typecheck` | `tsc --noEmit`                               |
| `npm run lint`      | ESLint                                       |
| `npm run test`      | Vitest unit tests (DSP / filters / EDF)      |

## Deployment (GitHub Pages)

CI (`.github/workflows/ci.yml`) runs typecheck + lint + tests + build on every push/PR.

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push
to `main` (already enabled via **Settings → Pages → Build and deployment → Source: GitHub
Actions**). The Pages build sets `GITHUB_PAGES=true`, which makes Vite emit a **relative
base** (`./`, see `vite.config.ts`) so the bundled assets resolve correctly under the
project-site path (`/LFP_Agent-demo/`) regardless of repository-name casing — there's no
base path to keep in sync if you rename the repo.

Because it's a static SPA, you can also deploy `npm run build` output to Netlify, Vercel,
or any static host — those build against the root path automatically.

## ⚠️ Security note on API keys

All `VITE_*` environment variables are **inlined into the client bundle** and are therefore
visible to anyone who loads the site. The GitHub Pages deploy intentionally builds **without**
any LLM key, so the public demo ships with the AI Analyst disabled until a key is provided.

For a public deployment that needs the AI Analyst, either:

1. Use an API key with strict quotas / referrer restrictions, or
2. Front the LLM calls with a thin backend proxy that holds the key server-side (e.g. a
   `/api/chat` serverless function) and have `services/llmService.ts` call that instead of
   the provider URLs directly. (Not implemented here.)
