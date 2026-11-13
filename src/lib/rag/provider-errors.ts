import { AppError } from "@/lib/errors";
import { OpenRouterError } from "@/lib/rag/openrouter";

/**
 * Maps provider failures to safe application errors. Raw provider messages,
 * bodies and status text never reach the client. A 429 means rate limiting; a
 * 402 means the account has no quota/credits for the request.
 */
export function mapProviderError(error: OpenRouterError): AppError {
  if (error.kind === "timeout") {
    return new AppError(
      "RAG_PROVIDER_TIMEOUT",
      "El proveedor de respuestas tardó demasiado. Intentá nuevamente en unos minutos.",
    );
  }

  if (error.status === 429) {
    return new AppError(
      "RAG_PROVIDER_RATE_LIMITED",
      "El proveedor de respuestas está limitando las solicitudes. Intentá de nuevo en unos minutos.",
    );
  }

  if (error.status === 402) {
    return new AppError(
      "RAG_PROVIDER_QUOTA_EXCEEDED",
      "El proveedor de respuestas no tiene cuota disponible en este momento.",
    );
  }

  return new AppError(
    "RAG_PROVIDER_ERROR",
    "No se pudo obtener una respuesta del proveedor. Revisá la configuración o intentá más tarde.",
  );
}
