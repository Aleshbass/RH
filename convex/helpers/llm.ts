/**
 * One small door to a large language model, used by the AI scribe (convex/scribe.ts).
 *
 * The provider and model come from Convex environment variables, so they can be switched
 * without a code change (`npx convex env set ...`):
 *   LLM_PROVIDER   "openai" (default) or "gemini"
 *   LLM_MODEL      the model name; when empty, DEFAULT_MODELS below
 *   OPENAI_API_KEY / GEMINI_API_KEY
 * Speech to text is always OpenAI (OPENAI_TRANSCRIBE_MODEL): live through a short-lived key the
 * browser uses directly, or one short recording at a time as a fallback.
 *
 * Prompts carry clinical text, so nothing sent or received is ever logged, and error messages
 * never include the provider's response body. Plain fetch, so it runs in Convex's default runtime.
 */
import { ConvexError } from "convex/values";

export type LlmProvider = "openai" | "gemini";

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: "gpt-5-mini",
  gemini: "gemini-3.6-flash",
};

/** A full note from a long session can take a while; past this the request is given up. */
const TIMEOUT_MS = 120_000;

export function llmConfig(): { provider: LlmProvider; model: string } {
  const raw = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase() || "openai";
  if (raw !== "openai" && raw !== "gemini") {
    throw new ConvexError(`LLM_PROVIDER must be "openai" or "gemini" (it is "${raw}").`);
  }
  const provider = raw as LlmProvider;
  return { provider, model: process.env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider] };
}

export type JsonRequest = {
  /** The rules the model follows */
  system: string;
  /** The material to work on */
  user: string;
  /** Room for the answer (and, on reasoning models, the thinking before it) */
  maxOutputTokens?: number;
};

export type JsonReply = { text: string; provider: LlmProvider; model: string };

/** Asks the model for a single JSON object and returns its raw text, to be parsed by the caller. */
export async function callLlmJson(req: JsonRequest): Promise<JsonReply> {
  const { provider, model } = llmConfig();
  const text = provider === "gemini" ? await callGemini(model, req) : await callOpenAi(model, req);
  return { text, provider, model };
}

async function callOpenAi(model: string, req: JsonRequest): Promise<string> {
  const res = await postWithTimeout("https://api.openai.com/v1/chat/completions", {
    headers: { Authorization: `Bearer ${openAiKey()}` },
    body: {
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: req.maxOutputTokens ?? 16_000,
      ...reasoningEffort(model),
      // Don't keep this conversation in OpenAI's stored completions
      store: false,
    },
  });
  const data = await readJson(res, "OpenAI");
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new ConvexError("The AI ran out of room writing the note. Try again, or split a very long session.");
  }
  const text = choice?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new ConvexError("The AI sent back an empty draft. Try again.");
  return text;
}

/**
 * OpenAI's reasoning models (gpt-5*, o1, o3, o4...) think before answering; "low" is quicker and
 * enough for a note. LLM_REASONING_EFFORT overrides it. Other models don't take the setting.
 */
function reasoningEffort(model: string): { reasoning_effort?: string } {
  if (!/^(gpt-5|o\d)/i.test(model)) return {};
  return { reasoning_effort: process.env.LLM_REASONING_EFFORT?.trim() || "low" };
}

async function callGemini(model: string, req: JsonRequest): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new ConvexError("The AI scribe isn't set up yet: GEMINI_API_KEY is missing on Convex.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await postWithTimeout(url, {
    headers: { "x-goog-api-key": key },
    body: {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: req.maxOutputTokens ?? 16_000 },
    },
  });
  const data = await readJson(res, "Gemini");
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new ConvexError("The AI ran out of room writing the note. Try again, or split a very long session.");
  }
  const parts: unknown[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts.map((p) => (typeof (p as { text?: unknown })?.text === "string" ? (p as { text: string }).text : "")).join("");
  if (!text.trim()) throw new ConvexError("The AI sent back an empty draft. Try again.");
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Speech to text (OpenAI only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The transcription model, OPENAI_TRANSCRIBE_MODEL (default gpt-4o-transcribe). It must be one
 * that works with server-side voice detection: gpt-4o-transcribe or gpt-4o-mini-transcribe.
 */
export function transcribeModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-transcribe";
}

function openAiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new ConvexError("The AI scribe isn't set up yet: OPENAI_API_KEY is missing on Convex.");
  return key;
}

export type RealtimeSecret = { value: string; expiresAt: number; model: string };

/**
 * A short-lived key the browser uses to stream one microphone to OpenAI's live transcription
 * (WebRTC), so our own key never leaves the server. The key only opens a transcription session.
 */
export async function createRealtimeTranscriptionSecret(opts: {
  /** Words to expect (clinical terms), and the end of the transcript so far */
  prompt: string;
  /** near_field for a mic close to the speaker, far_field for a phone on the desk, null for call audio */
  noiseReduction: "near_field" | "far_field" | null;
  /** ISO-639-1, when the whole session is in one known language */
  language?: string;
  /** A stable, non-identifying id for the physio (a hash), so OpenAI can spot abuse per user */
  safetyId?: string;
  ttlSeconds?: number;
}): Promise<RealtimeSecret> {
  const model = transcribeModel();
  const res = await postWithTimeout("https://api.openai.com/v1/realtime/client_secrets", {
    headers: {
      Authorization: `Bearer ${openAiKey()}`,
      ...(opts.safetyId ? { "OpenAI-Safety-Identifier": opts.safetyId } : {}),
    },
    body: {
      expires_after: { anchor: "created_at", seconds: opts.ttlSeconds ?? 600 },
      session: {
        type: "transcription",
        audio: {
          input: {
            noise_reduction: opts.noiseReduction ? { type: opts.noiseReduction } : null,
            transcription: { model, prompt: opts.prompt, ...(opts.language ? { language: opts.language } : {}) },
            turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
          },
        },
      },
    },
  });
  const data = await readJson(res, "OpenAI");
  const value = typeof data?.value === "string" ? data.value : typeof data?.client_secret?.value === "string" ? data.client_secret.value : "";
  const expiresAt = Number(data?.expires_at ?? data?.client_secret?.expires_at);
  if (!value) throw new ConvexError("OpenAI didn't start the live transcript. Try again.");
  return { value, expiresAt: Number.isFinite(expiresAt) ? expiresAt * 1000 : Date.now() + 600_000, model };
}

/** Transcribes one short recording (WAV), for when the live connection isn't available. */
export async function transcribeAudioChunk(audio: ArrayBuffer, opts: { prompt: string; language?: string }): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "chunk.wav");
  form.append("model", transcribeModel());
  form.append("prompt", opts.prompt);
  form.append("response_format", "json");
  if (opts.language) form.append("language", opts.language);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey()}` },
      body: form,
      signal: controller.signal,
    });
  } catch {
    throw new ConvexError("We couldn't reach the transcription service. The recording keeps going; it'll retry.");
  } finally {
    clearTimeout(timer);
  }
  const data = await readJson(res, "OpenAI");
  return typeof data?.text === "string" ? data.text.trim() : "";
}

async function postWithTimeout(url: string, opts: { headers: Record<string, string>; body: unknown }): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...opts.headers },
      body: JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    throw new ConvexError("We couldn't reach the AI service. Check the connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response, name: string): Promise<any> {
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new ConvexError(`${name} rejected the API key. Check the key set on Convex.`);
    }
    if (res.status === 429) throw new ConvexError(`${name} is busy or out of credit. Try again in a minute.`);
    throw new ConvexError(`${name} couldn't do that just now (HTTP ${res.status}). Try again.`);
  }
  try {
    return await res.json();
  } catch {
    throw new ConvexError(`${name} sent back something we couldn't read. Try again.`);
  }
}
