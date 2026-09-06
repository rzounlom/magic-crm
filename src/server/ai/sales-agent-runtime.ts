import { createOpenAiSalesAgentClient } from "@/lib/ai/openai-sales-agent-client";
import { env } from "@/lib/env";
import { DEFAULT_OPENAI_SALES_MODEL } from "@/types/inquiry";
import type { SalesAgentRuntime } from "@/server/services/sales-agent-service";

export function readSalesAgentRuntime(): SalesAgentRuntime {
  const apiKey = env.OPENAI_API_KEY;
  const modelId = env.OPENAI_SALES_MODEL ?? DEFAULT_OPENAI_SALES_MODEL;
  if (!apiKey) {
    return { model: null, modelId };
  }
  return { model: createOpenAiSalesAgentClient(apiKey), modelId };
}
