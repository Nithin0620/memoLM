# MemoLM Backend — How To Use

Reference for the multi-provider gateway in this folder. Covers where API keys
and models go, how a request picks a provider, and how to test each one.

---

## 1. The three parties

Keep these separate. Most confusion about key ownership comes from mixing them up.

| Party | Where they work | What they configure |
|---|---|---|
| **Backend operator** | Runs this `backend/` folder | `backend/.env` — LLM API keys, models, base URLs, default provider |
| **SDK developer** | Their own app/server | `MEMOLM_BASE_URL` + a tenant ID. **No LLM key.** |
| **End user** | The app UI | Nothing. They just ask questions. |

---

## 2. Where the API keys go — the important part

**LLM API keys live in `backend/.env` and nowhere else.**

```
backend/.env
  GROQ_API_KEY=gsk_xxx
  GROQ_MODEL=openai/gpt-oss-20b
```

They are read from the **backend process's own environment** at
`provider/base.py:60`:

```python
self.api_key = (os.getenv(f"{env_prefix}_API_KEY") or "").strip()
```

A request can name a provider and a model. It can **never** name a key or a base
URL. Those are resolved server-side so the key never reaches the browser and
never leaves the process. This is stated in the code at `provider/base.py:38-44`.

### Why a developer's `.env` is not used

`.env` is only visible to the process that loads it. The SDK developer's app and
this backend are separate processes, usually on separate machines:

```
DEVELOPER'S APP                        THIS BACKEND
.env:                                  .env:
  MEMOLM_BASE_URL=...                     GROQ_API_KEY=gsk_you
                                          GROQ_MODEL=openai/gpt-oss-20b
       |                                       |
       |-- POST /v1/chat/completions -------->|
       |   x-memolm-tenant: acme-corp         | reads ITS OWN .env
       |   (never sends a key)                | calls Groq with YOUR key
       |<-- answer ----------------------------|
```

The only variable a developer's app reads is `MEMOLM_BASE_URL`
(`sdk/typescript/examples/basic-chat.ts:5`).

### What this means today

If a second developer imports the SDK:

- Their traffic is billed to **this backend operator's** key.
- Requesting `provider: anthropic` returns `400` unless the operator has added
  `ANTHROPIC_API_KEY` to `backend/.env`.
- Requesting a different **model** on an already-configured provider does work —
  the model is a client-supplied field.

**Per-developer (bring-your-own) keys are not implemented.** See section 12.

---

## 3. Configuration reference

Copy `backend/.env.example` to `backend/.env` and fill it in. Never commit real
values.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `MEMOLM_DEFAULT_PROVIDER` | no | `groq` | Provider used when a request names none |
| `GROQ_API_KEY` | for groq | — | Groq credential |
| `GROQ_MODEL` | no | `openai/gpt-oss-20b` | Default model on Groq |
| `GROQ_BASE_URL` | no | vendor | Override Groq endpoint |
| `OPENAI_API_KEY` | for openai | — | OpenAI credential |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Default model on OpenAI |
| `OPENAI_BASE_URL` | no | vendor | Point at any OpenAI-compatible endpoint |
| `ANTHROPIC_API_KEY` | for anthropic | — | Anthropic credential |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-4-5` | Default model on Anthropic |
| `ANTHROPIC_BASE_URL` | no | vendor | Override Anthropic endpoint |
| `GEMINI_API_KEY` | for gemini | — | Gemini credential |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | Default model on Gemini |
| `GEMINI_BASE_URL` | no | vendor | Override Gemini endpoint |
| `QDRANT_URL` | yes | — | Vector store |
| `QDRANT_API_KEY` | if required | — | Vector store credential |

Naming rule: any provider is configured with `<PREFIX>_API_KEY`,
`<PREFIX>_MODEL` and `<PREFIX>_BASE_URL`, where `<PREFIX>` is the provider's
`env_prefix` column in the table below.

---

## 4. Providers

Four providers, each a separate LangChain integration package. An unconfigured
provider costs nothing — nothing is imported until it is requested.

| `provider` | Aliases | LangChain class | Package | Credential field | Token-limit field | Default model |
|---|---|---|---|---|---|---|
| `groq` | — | `ChatGroq` | `langchain-groq` | `groq_api_key` | `max_tokens` | `openai/gpt-oss-20b` |
| `openai` | — | `ChatOpenAI` | `langchain-openai` | `api_key` | `max_tokens` | `gpt-4o-mini` |
| `anthropic` | `claude` | `ChatAnthropic` | `langchain-anthropic` | `anthropic_api_key` | `max_tokens` | `claude-sonnet-4-5` |
| `gemini` | `google`, `google_genai`, `google-genai`, `googleai` | `ChatGoogleGenerativeAI` | `langchain-google-genai` | `google_api_key` | **`max_output_tokens`** | `gemini-2.5-flash` |

Source: `provider/__init__.py:27-41` and each `provider/*_provider.py`.

### Base URL overrides

`OPENAI_BASE_URL` fronts any OpenAI-compatible endpoint — vLLM, LM Studio,
OpenRouter, Together, NVIDIA NIM — with no code change. `GROQ_BASE_URL` and
`ANTHROPIC_BASE_URL` behave the same way. `GEMINI_BASE_URL` is applied to
`google_api_url`.

---

## 5. How a request picks a provider and model

**Provider** — first match wins (`main.py:91`):

1. `x-memolm-provider` request header
2. `provider` field in the JSON body
3. `MEMOLM_DEFAULT_PROVIDER` from `backend/.env`
4. `groq`

Names are case-insensitive and trimmed, and aliases resolve via
`PROVIDER_ALIASES` (`provider/__init__.py:35-41`), so `claude` → `anthropic`.

**Model** — first match wins (`main.py:107`):

1. `model` field in the JSON body
2. `<PREFIX>_MODEL` from `backend/.env`
3. The provider class's built-in `default_model`

So a bare request with no provider and no model runs on
`MEMOLM_DEFAULT_PROVIDER` / `<PREFIX>_MODEL`, which by default is Groq.

---

## 6. Token limits and temperature

`max_tokens` defaults to **4096** (`provider/base.py:26`, `DEFAULT_MAX_TOKENS`).
LangChain's own default of 1024 silently truncates long answers, so the gateway
always supplies a value.

- `max_tokens` and `temperature` are read from the request body, and are passed
  through as per-call bind options rather than at construction, so the chat
  model cache stays keyed on model name alone.
- An unparseable `temperature` is ignored rather than failing the request.
- Gemini is the one exception: it overrides `_options()` to emit
  `max_output_tokens` (`provider/gemini_provider.py:30-34`), because passing
  `max_tokens` there would be rejected by the Gemini API.
- Anthropic requires `max_tokens` on every call, so the default matters for it
  more than for the others.

---

## 7. Groq policy: `langchain-groq` only

All Groq traffic goes through `langchain-groq` (`provider/groq_provider.py:14`).

There is **no raw `groq` SDK fallback anywhere in this folder.** If
`langchain-groq` cannot serve a case, the gateway surfaces the failure — it does
not quietly drop to the raw client. This is recorded in `requirements.txt`.

`groq` still appears in `pip list` because `langchain-groq` depends on it
transitively. That is expected and is not a direct dependency.

`chat.py` uses `langchain_openai.ChatOpenAI` rather than `ChatGroq` on purpose:
that script is a *gateway* client aimed at `localhost:8000`, not an upstream
client, so the OpenAI-compatible client is the correct one.

---

## 8. Endpoints

All three chat paths are the same handler:

```
POST /v1/chat/completions
POST /openai/v1/chat/completions
POST /chat/completions
```

Cache management:

```
POST /cache/invalidate   { "tenant_id": ..., "version": ... }
POST /cache/inspect      { "query": ..., "tenant_id": ..., "version": ... }
POST /cache/seed         { "items": [ { "query": ..., "answer": ... } ] }
```

`/cache/inspect` is a dry run — it reports cosine similarity and whether the
Safety Gate would pass, without making a billable LLM call. Use it when
debugging a surprising `CACHE_MISS`.

**There is no `/health` or `/v1/providers` endpoint.** To check which providers
are configured, use the command in section 10.

### Request headers

| Header | Default | Meaning |
|---|---|---|
| `x-memolm-tenant` | `default-tenant` | Cache namespace. One per developer/app |
| `x-memolm-version` | — | Knowledge version. Bump to force a Safety Gate reject |
| `x-memolm-risk` | `low` | `low` / `medium` / `high`. `high` disables caching |
| `x-memolm-provider` | — | Provider for this request |
| `x-memolm-ttl` | computed | Override the computed TTL in seconds |
| `x-memolm-force-refresh` | `false` | Skip the read, still write |
| `x-memolm-cache-only` | `false` | Never call upstream; 404 if no hit |

`Authorization` is **not read by this backend.** There is currently no gateway
authentication — see section 12.

---

## 9. Caching, TTL, and the personal-data guard

`get_semantic_ttl()` (`dynamic_ttl.py:341`) decides how long an answer is kept.
It returns `0` — never cached — in two cases, checked before any scoring:

- **`x-memolm-risk: high`**
- **The query looks per-user** — `contains_personal_data()`

The personal-data guard exists because a tenant is shared by all of one
developer's end users, and the cache key carries no end-user identity. A
question that varies per user ("where is my order 4471?") would otherwise cache
user A's answer and serve it to user B.

It matches orders and other 4+ digit ids, phone numbers, emails, and possessive
phrases over personal nouns (`my order`, `my name`, `my billing address`,
`this user's email`). The last two prior user turns are checked too, because they
contribute to the retrieval vector.

The list is deliberately generous. A false positive costs one real LLM call; a
false negative leaks one user's data to another. When they conflict it leans
toward over-blocking. **It is a pattern match, not a structural guarantee** — a
personal query phrased unusually can still reach the cache.

---

## 10. Running and testing

### Install

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### Check which providers are configured

Keys are never printed.

```powershell
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -c "from provider import describe_providers; [print(d) for d in describe_providers()]"
```

```
{'provider': 'anthropic', 'configured': False, 'default_model': 'claude-sonnet-4-5'}
{'provider': 'gemini',    'configured': False, 'default_model': 'gemini-2.5-flash'}
{'provider': 'groq',      'configured': True,  'default_model': 'openai/gpt-oss-20b'}
{'provider': 'openai',    'configured': False, 'default_model': 'gpt-4o-mini'}
```

### Start the server

```powershell
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe main.py
```

Watch this terminal — every cache verdict prints here.

### Confirm your key can reach your model

Model access is per-API-key. A model your key cannot reach returns
`404 model_not_found`, not an auth error, so check before debugging anything else.

```powershell
$key = (Get-Content .env | Select-String '^GROQ_API_KEY=').ToString().Split('=')[1].Trim()
Invoke-RestMethod "https://api.groq.com/openai/v1/models" -Headers @{ Authorization = "Bearer $key" } |
  Select-Object -ExpandProperty data | Select-Object -ExpandProperty id
```

### Interactive REPL

```powershell
.\.venv\Scripts\python.exe chat.py
```

No provider is named anywhere, so it defaults through the configured default
provider. Type `version v13` mid-session to bump the knowledge version and force
a Safety Gate reject. Type `exit` to quit.

### Full check suite

Second terminal:

```powershell
$u='http://127.0.0.1:8000/v1/chat/completions'
$h=@{'x-memolm-tenant'='dev-a';'x-memolm-version'='v1';'x-memolm-risk'='low'}
function Ask($q,$extra=@{}){
  $hh=$h.Clone(); foreach($k in $extra.Keys){$hh[$k]=$extra[$k]}
  $b=@{messages=@(@{role='user';content=$q})}|ConvertTo-Json -Depth 5
  Invoke-RestMethod $u -Method Post -Headers $hh -Body $b -ContentType 'application/json'
}
function Check($n,$got,$want){
  $ok = "$got" -eq "$want"
  "{0,-4} {1,-40} got={2,-16} want={3}" -f $(if($ok){'PASS'}else{'FAIL'}),$n,$got,$want
}

$r = Ask 'What is the capital of France?'
Check 'cold miss'         $r.memolm_stats.verdict 'CACHE_MISS'
Check 'warm hit'          (Ask 'What is the capital of France?').memolm_stats.verdict 'SAFE_CACHE_HIT'
Check 'content'           ($r.choices[0].message.content -match 'Paris') 'True'
Check 'provider default'  $r.provider 'groq'
Check 'tenant isolation'  (Ask 'What is the capital of France?' @{'x-memolm-tenant'='dev-b'}).memolm_stats.verdict 'CACHE_MISS'
Check 'personal guard'    (Ask 'What is the status of my order 778812?').memolm_stats.verdict 'CACHE_MISS'
```

### Streaming

Use `curl.exe`, not `Invoke-RestMethod` — it buffers, so you would see nothing stream.

```powershell
curl.exe -N -X POST http://127.0.0.1:8000/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "x-memolm-tenant: dev-a" -H "x-memolm-version: s1" -H "x-memolm-risk: low" `
  -d '{\"model\":\"openai/gpt-oss-20b\",\"messages\":[{\"role\":\"user\",\"content\":\"Count from one to five.\"}],\"stream\":true}'
```

### Test a specific provider

Add its key to `backend/.env`, restart, then name it per request:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/v1/chat/completions -Method Post -ContentType 'application/json' `
  -Headers @{'x-memolm-provider'='anthropic';'x-memolm-tenant'='dev-a';'x-memolm-version'='a1'} `
  -Body '{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"hi"}]}'
```

Test `anthropic` first when adding a provider — it requires `max_tokens` and
handles the `system` role differently, so it is the most likely to need a fix.

### Error responses

| Status | Cause | Body |
|---|---|---|
| `400` | Unknown provider | `{"error":{"message":"Unknown provider 'x'. Available: ...","type":"provider_unavailable","available_providers":[...]}}` |
| `400` | Provider has no key | Same shape; message names the missing env var, e.g. `Set GEMINI_API_KEY` |
| `502` | Upstream LLM failed | Message is sanitised — raw upstream text and keys are not echoed |

An unconfigured provider is a `400`, not a `401`. That is deliberate: it is a
deployment problem to fix, not a caller-auth problem.

---

## 11. Reading the verdicts

`memolm_stats.verdict` on every response:

| Verdict | Meaning |
|---|---|
| `CACHE_MISS` | Nothing above the similarity threshold → real LLM call, then saved |
| `SAFE_CACHE_HIT` | Served from cache — typically ~20ms instead of ~5s |
| `SAFETY_REJECTED` | A similar answer exists but the version/risk check failed → re-routed upstream |
| `PERSONAL_DATA_BYPASS` | Per-user query; cache skipped in both directions |

---

## 12. Known gaps

Three things this design does not do. Listed so nobody discovers them in
production.

**1. No per-developer (bring-your-own) keys.** Keys are operator-owned only. A
second developer's traffic bills the operator. Adding BYOK would mean reading a
key off the request and preferring it over `os.getenv` — and `provider/__init__.py:43`
caches one provider instance per *name*, so that instance cache would have to
become keyed on `(provider, key fingerprint)`. Without that change two developers
on the same provider would share the first key's client object.

**2. No gateway authentication.** Nothing in this backend reads the
`Authorization` header, so anyone who learns the URL can spend the operator's
LLM key. Keep the gateway on a private network or behind an auth proxy until
this is addressed.

**3. The personal-data guard is pattern-based.** It over-blocks on purpose, but a
personal query phrased outside the patterns can still enter a shared cache. The
structural fix is per-user isolation, which gives up the sharing that is the
point of a semantic cache.

---

## 13. Troubleshooting

| Symptom | Cause |
|---|---|
| Every call is `CACHE_MISS` and it feels slow | Qdrant unreachable. Watch the server log for `[Qdrant] Saved point` — no lines means writes are failing |
| `SAFETY_REJECTED` when you expected `CACHE_MISS` | A previous run cached the same question under the same tenant+version. Bump `x-memolm-version` or use a fresh tenant |
| `404 model_not_found` from the vendor | Your key cannot reach that model. Section 10, "Confirm your key can reach your model" |
| `400` naming a provider you configured | Key is blank or whitespace. `ProviderConfig` strips and treats empty as unconfigured |
| Provider `configured: True` but calls fail | The adapter built successfully; the failure is the vendor. Check the server log |
| `CACHE_MISS` on an obviously-shared question | The question looks per-user to the guard, or `x-memolm-risk` is `high`. Both force TTL 0 |
