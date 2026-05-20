# Local AI DJ

A local AI DJ MVP with a dark player UI, chat panel, mock music queue, optional weather and text-to-speech integrations, and a Codex app-server brain provider with a local fallback.

## Features

- Vite + React + TypeScript frontend
- Express local API server
- PWA manifest and icon
- Mock track library with mood, weather, time-slot, and style metadata
- Generated local WAV audio for playable mock tracks
- Chat endpoint that attempts Codex runtime reasoning and falls back to local DJ rules
- Optional OpenWeather and Fish Audio integrations

## Quick Start

```bash
npm install
npm run dev
```

Open:

- Frontend: http://127.0.0.1:5173
- API state: http://127.0.0.1:8787/api/state

## Desktop App

Run the Electron desktop shell:

```bash
npm run desktop
```

This starts the local API server, the Vite frontend, and then opens Local AI DJ in a native desktop window.

If the services are already running, you can open only the Electron shell:

```bash
npx electron electron/main.cjs
```

Create a Windows portable build:

```bash
npm run desktop:dist
```

## Environment

Copy `.env.example` to `.env` and fill only the services you want to enable.

```bash
OPENWEATHER_API_KEY=
OPENWEATHER_LAT=31.2304
OPENWEATHER_LON=121.4737

FISH_API_KEY=
FISH_REFERENCE_ID=

AI_DJ_BRAIN=codex
CODEX_MODEL=gpt-5.4
```

Without API keys, the app still runs with mock weather and text-only voice mode.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run desktop
```

## Notes

The first version intentionally uses mock songs rather than a real music provider. A future `MusicProvider` can adapt this to a local library or a third-party music service.
