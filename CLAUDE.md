# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
expo start          # Start dev server (scan QR code with Expo Go app)
expo start --ios    # Run on iOS simulator
expo start --android # Run on Android emulator
expo start --web    # Run in browser
```

No test or lint scripts are configured.

## Architecture

Single-screen React Native weather app built with Expo. All application logic lives in `App.tsx` — there is no navigation library, no separate screens folder, and no global state management (React hooks only).

**Data flow:**
1. On mount, restores last ZIP code from `AsyncStorage`
2. User submits a US ZIP code → `fetchWeather()` runs two sequential API calls:
   - **Zippopotam.us** — resolves ZIP to city name + lat/lon
   - **Open-Meteo** — fetches 7-day forecast for those coordinates
3. ZIP is persisted to `AsyncStorage` after each successful fetch

**Key state:** `zipInput`, `cityName`, `forecast[]`, `loading`, `error` — all local to the root component.

## TypeScript

Strict mode is enabled (`tsconfig.json` extends `expo/tsconfig.base` with `"strict": true`).
