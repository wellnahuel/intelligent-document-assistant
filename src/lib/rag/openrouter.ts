import { z } from "zod";

import type {
  OpenRouterCompletion,
  OpenRouterConfig,
  OpenRouterUsage,
} from "@/lib/rag/types";

export const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterErrorKind =
  | "timeout"
  | "network"
  | "http"
  | "upstream"
  | "malformed";

export class OpenRouterError extends Error {
  readonly kind: OpenRouterErrorKind;
  readonly status: number | null;

  constructor(kind: OpenRouterErrorKind, message: string, status?: number) {
    super(message);
    this.name = "OpenRouterError";
    this.kind = kind;
    this.status = status ?? null;
  }
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const usageSchema = z.object({
  prompt_tokens: z.number().finite().optional(),
  completion_tokens: z.number().finite().optional(),
  total_tokens: z.number().finite().optional(),
  cost: z.number().finite().optional(),
});

const providerErrorSchema = z.object({
  code: z.union([z.number(), z.string()]).optional(),
  message: z.string().optional(),
});

const choiceSchema = z.object({
  message: z
    .object({
      content: z.string().nullable().optional(),
    })
    .optional(),
  finish_reason: z.string().nullable().optional(),
  error: providerErrorSchema.optional(),
});

const completionSchema = z.object({
  choices: z.array(choiceSchema).optional(),
  model: z.string().optional(),
  usage: usageSchema.nullable().optional(),
  error: providerErrorSchema.optional(),
});

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeUsage(
  usage: z.infer<typeof usageSchema> | null | undefined,
): OpenRouterUsage | null {
  if (!usage) {
    return null;
  }

  return {
    promptTokens: finiteOrNull(usage.prompt_tokens),
    completionTokens: finiteOrNull(usage.completion_tokens),
    totalTokens: finiteOrNull(usage.total_tokens),
    cost: finiteOrNull(usage.cost),
  };
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export async function requestChatCompletion(input: {
  config: OpenRouterConfig;
  system: string;
  user: string;
  fetchImpl?: FetchLike;
}): Promise<OpenRouterCompletion> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Intelligent Document Assistant",
      },
      body: JSON.stringify({
        model: input.config.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(input.config.timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new OpenRouterError(
        "timeout",
        "The OpenRouter request exceeded the configured timeout.",
      );
    }

    throw new OpenRouterError(
      "network",
      "The OpenRouter request could not be completed.",
    );
  }

  let rawBody: string;

  try {
    rawBody = await response.text();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new OpenRouterError(
        "timeout",
        "The OpenRouter response exceeded the configured timeout.",
      );
    }

    throw new OpenRouterError(
      "malformed",
      "The OpenRouter response could not be read.",
    );
  }

  if (!response.ok) {
    throw new OpenRouterError(
      "http",
      "OpenRouter returned an error status.",
      response.status,
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new OpenRouterError(
      "malformed",
      "OpenRouter returned a response that is not valid JSON.",
    );
  }

  const parsed = completionSchema.safeParse(body);

  if (!parsed.success) {
    throw new OpenRouterError(
      "malformed",
      "OpenRouter returned an unexpected response shape.",
    );
  }

  if (parsed.data.error) {
    throw new OpenRouterError(
      "upstream",
      "OpenRouter reported a provider error.",
    );
  }

  const choice = parsed.data.choices?.[0];

  if (!choice) {
    throw new OpenRouterError(
      "upstream",
      "OpenRouter returned no completion choices.",
    );
  }

  if (choice.error) {
    throw new OpenRouterError(
      "upstream",
      "OpenRouter reported a provider error in the completion.",
    );
  }

  const content = choice.message?.content?.trim();

  if (!content) {
    throw new OpenRouterError(
      "malformed",
      "OpenRouter returned an empty completion.",
    );
  }

  return {
    content,
    model: parsed.data.model ?? input.config.model,
    finishReason: choice.finish_reason ?? null,
    usage: normalizeUsage(parsed.data.usage),
  };
}
