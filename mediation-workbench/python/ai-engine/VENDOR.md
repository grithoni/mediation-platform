# Vendored AI Engine — nanobot

This directory contains a vendored copy of the **nanobot** AI agent engine so the
mediation workbench can run its own internal AI service without depending on an
external `nanobot` installation, external CLI, or `~/.nanobot` configuration.

## Upstream

| Field            | Value                                             |
|------------------|---------------------------------------------------|
| Project          | nanobot (nanobot-ai)                              |
| Version          | 0.3.0                                             |
| License          | MIT (see `LICENSE`, `THIRD_PARTY_NOTICES.md`)     |
| Source           | `/Users/honi/Desktop/projects/nanobot-0.3.0`      |
| Vendored on      | 2026-08-03                                        |

## What was copied

- `nanobot/` — the complete Python package (runtime source only):
  - `__pycache__` / `*.pyc` excluded
  - `nanobot/web/dist/` excluded (prebuilt WebUI bundle; not needed for `serve`)
- `pyproject.toml` — upstream metadata + dependency declarations (version record)
- `LICENSE`, `THIRD_PARTY_NOTICES.md` — upstream license / third-party notices
- `README.md` — upstream readme for reference

## What was NOT copied

- Secrets, `.env`-style files, API keys
- Virtual environments (`.venv`, `.venv-ai`)
- Caches, build artifacts, `webui/` source, `images/`, `docs/`, `tests/`
- `.agent/` operational docs

## Integration (not upstream)

The following files are local additions, not part of upstream nanobot:

- `config.example.json` — engine config template (secrets resolved at setup)
- `requirements.txt` — generated from `pyproject.toml` base deps + `api` extra
- `scripts/generate-requirements.py` — requirements generator
- `scripts/setup.sh` — one-shot venv + config setup
- `scripts/engine.sh` — manual start/stop/status helpers
- `VENDOR.md` — this record

Runtime state lives under `.data/ai/` (git-ignored): `config.json`, `engine.pid`,
`engine.log`, `workspace/`, `media/`, session data.

## How the engine runs

The Nuxt server plugin `server/plugins/ai-engine.ts` owns the engine lifecycle:

1. On workbench boot it health-checks `http://127.0.0.1:8900/health`.
2. If unhealthy and no healthy external instance owns the port, it spawns
   `.venv-ai/bin/python -m nanobot serve --config .data/ai/config.json
   --host 127.0.0.1 --port 8900` and waits for `/health`.
3. On workbench shutdown it sends SIGTERM to the recorded PID and cleans up.
4. A healthy engine (even from a prior run) is adopted, never double-spawned.

## Updating the vendored engine

```bash
rsync -a --exclude '__pycache__' --exclude '*.pyc' --exclude '/web/dist/' \
  <upstream>/nanobot/ python/ai-engine/nanobot/
cp <upstream>/pyproject.toml python/ai-engine/pyproject.toml
cp <upstream>/LICENSE python/ai-engine/LICENSE
cp <upstream>/THIRD_PARTY_NOTICES.md python/ai-engine/THIRD_PARTY_NOTICES.md
python3 python/ai-engine/scripts/generate-requirements.py --write
```

Update the version row above and re-run `scripts/setup.sh` afterwards.
