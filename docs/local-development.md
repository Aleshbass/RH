# Local Joy development

This setup keeps the production services isolated:

- Joy API and worker run on this machine.
- Joy PostgreSQL and Redis run in Docker under the `joy-local` project.
- RH Next.js runs locally and is the only RH HTTP origin Joy calls.
- RH's **Convex development deployment** is used by that local Next.js app.
- Do not use the production Convex deployment (`adept-horse-443`), Railway
  PostgreSQL/Redis, live Paystack, or live WhatsApp delivery for this setup.

## 1. Start Joy's local stores

From `backend`:

```powershell
docker compose up -d
docker compose ps
```

The containers are named `joy-local-postgres` and `joy-local-redis`. They use
host ports `55432` and `56379`, avoiding a normal local PostgreSQL/Redis
installation on `5432`/`6379`.

## 2. Configure Joy

Copy `backend/.env.example` to `backend/.env` and set only development values.
Use a newly generated `DEV_CONSOLE_TOKEN`, a development Gemini key, and the
local RH origin:

```dotenv
DATABASE_URL=postgresql+psycopg://joy:joy_local_only@127.0.0.1:55432/joy_dev
REDIS_URL=redis://127.0.0.1:56379/0
JOY_ENVIRONMENT=development
DISABLE_WHATSAPP_DELIVERY=true
DEV_CONSOLE_TOKEN=<a-long-random-local-secret>
RH_API_BASE_URL=http://127.0.0.1:3000
```

Gemini remains the default text provider. If you deliberately want to test an
alternative text provider, configure exactly one of these server-side modes,
then restart both the API and worker:

```dotenv
# Default
LLM_PROVIDER=gemini

# OpenAI direct (requires an OpenAI API key and enabled API billing)
# LLM_PROVIDER=openai
# OPENAI_API_KEY=<server-only-key>
# OPENAI_TEXT_MODEL=gpt-5-mini

# OpenRouter with one bounded fallback on 429/502/503/504
# LLM_PROVIDER=openrouter
# OPENROUTER_API_KEY=<server-only-key>
# OPENROUTER_TEXT_MODEL=<primary-model-id>
# OPENROUTER_FALLBACK_MODELS=<one-fallback-model-id>
```

Joy never silently swaps providers. `/api/ready` reports only whether the
selected provider is configured; it does not expose a key or make a paid model
call. Voice transcription remains Gemini-backed even when text triage uses an
explicit alternate provider.

Copy the development-only Joy/RH HMAC values into the corresponding `RH_*`
variables. Do not copy any production key into this file.

## 3. Point local RH at Convex development

In RH's local `.env.local`, use its **development** `CONVEX_DEPLOYMENT` and
`NEXT_PUBLIC_CONVEX_URL`, and verify neither value points to
`adept-horse-443`. Deployment names are environment-specific, so do not infer
the environment from a remembered `kindle-…` prefix alone. Preserve its
development gateway secrets. Then run RH from the RH repository:

```powershell
npm run dev
```

Verify its Joy endpoints locally before exercising a turn:

```powershell
Invoke-WebRequest http://127.0.0.1:3000/api/v1/joy/policy/current
```

## 4. Migrate and run Joy

Open two PowerShell terminals in `backend`:

```powershell
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
python -m app.queue.worker
```

The worker is safe to run locally because `DISABLE_WHATSAPP_DELIVERY=true`.
It will process local queue work but cannot contact Meta.

## 5. Exercise a real Joy turn

Open <http://127.0.0.1:8000/internal/dev/console>. Enter the local console
token, choose an E.164 test number, and send messages. The console invokes the
same `process_inbound` and conversation handler used by the WhatsApp worker,
persists to local Joy PostgreSQL, and shows the structured reply/error in the
browser and terminal. It does not create an inbound Meta message or send an
outbound WhatsApp message.

The console and `/internal/dev/chat` return 404 outside development and require
`X-Joy-Dev-Token` for chat requests. They must not be deployed or exposed as a
public production feature.
# Direct RH Convex gateway (optional)

Joy can bypass the RH Next.js adapter for provider resolution, matching,
availability, pending booking holds, booking reads/cancellation, and the fixed
operational allowlist. Configure these only in Joy's local `.env`:

```dotenv
RH_CONVEX_GATEWAY_BASE_URL=https://<your-development-deployment>.convex.site
RH_CONVEX_GATEWAY_HMAC_SECRET=<same value as CONVEX_JOY_GATEWAY_SECRET in that Convex development deployment>
```

Restart both the local API and worker after changing `.env`. The value is an
operational gateway credential, not a Convex deployment/admin token. It must
never be exposed to the browser or committed. Leave both variables blank to
use the RH adapter exclusively.

Payment initialization still goes through RH: it owns the Paystack secret,
fee settings, and the payment webhook. A payment completion is never produced
by Joy or by this gateway.
