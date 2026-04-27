# SPROUT — Asahi R&D Ideation Hub

A demo dashboard that pulls global beverage / food / sustainability news from
free RSS sources and matches it against an Asahi-style "internal seed" library
to surface ideation opportunities.

> All people, ideas, comments and seed technologies in this app are fictitious
> mock data, unrelated to the real Asahi Group.

## Stack
- **Frontend** — React 18 (UMD) + Babel Standalone + Tailwind CDN. No build step.
- **Backend** — Single Python file (`server.py`) using only the standard library.
- **Persistence** — `sources.json` written next to `server.py` (ephemeral on Render free tier).

## Run locally
```sh
python3 server.py
# open http://localhost:4321
```

## Deploy on Render

This repo includes a `render.yaml` Blueprint. Click:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

Or manually: New → Blueprint → point at this repo → Apply.

After deploy, set the optional `ANTHROPIC_API_KEY` env var in the Render
dashboard to enable Claude-powered 3-line summaries (the app falls back to a
heuristic summarizer if absent).

## Endpoints
- `GET  /api/articles`            — fetch + score + cache
- `GET  /api/sources`             — list sources + presets + status
- `POST /api/sources`             — add source
- `PATCH /api/sources/<id>`       — toggle / edit
- `DELETE /api/sources/<id>`      — remove (built-ins disabled instead)
- `POST /api/sources/<id>/refresh` — refresh single source
