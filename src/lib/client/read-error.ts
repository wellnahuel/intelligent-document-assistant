export function readErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return null;
  }

  const error = (payload as { error?: unknown }).error;

  if (typeof error !== "object" || error === null) {
    return null;
  }

  const message = (error as { message?: unknown }).message;

  return typeof message === "string" && message.length > 0 ? message : null;
}
