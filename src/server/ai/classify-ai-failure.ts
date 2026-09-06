export type AiFailureClassification = {
  category: string;
  httpStatus: number | null;
};

export function classifyAiFailure(error: unknown): AiFailureClassification {
  const record = error !== null && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const status = typeof record?.status === "number" ? record.status : null;
  const name = typeof record?.name === "string" ? record.name : "";
  const code = typeof record?.code === "string" ? record.code : "";
  const message = typeof record?.message === "string" ? record.message : "";

  if (status === 429 || code === "rate_limit_exceeded") {
    return { category: "OPENAI_RATE_LIMIT", httpStatus: status ?? 429 };
  }
  if (status !== null && status >= 500) {
    return { category: "OPENAI_UNAVAILABLE", httpStatus: status };
  }
  if (
    name.includes("Timeout") ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    /timeout/i.test(message)
  ) {
    return { category: "OPENAI_TIMEOUT", httpStatus: status };
  }

  return { category: "OPENAI_FAILURE", httpStatus: status };
}
