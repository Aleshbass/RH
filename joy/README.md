# Joy-AI

Joy is Rehabify's WhatsApp agent: a Python/FastAPI backend in `backend/`, deployed on Railway.

It lives inside the RH repo so Joy and the website change together:

- **Joy code:** `joy/backend` (Railway root directory; Railway watch paths `/joy/**`)
- **Website side of the integration:** `app/api/v1/joy/*` in the repo root
- **Contract between the two:** `joy/docs/JOY_RH_API_CONTRACT.md`
- **Local setup:** `joy/docs/local-development.md`
- **Tests:** `.github/workflows/joy.yml` runs `pytest` on every change under `joy/`

Vercel ignores this folder (`.vercelignore`) and skips building when only `joy/` changed (`vercel.json`).

History before the move is from the old `Aleshbass/Joy-AI` repo (imported with `git subtree`).
