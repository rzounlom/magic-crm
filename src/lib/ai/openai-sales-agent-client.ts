import "server-only";

import OpenAI from "openai";

import {
  buildOpenAiSalesAgentCreateParams,
  readOpenAiResponseText,
} from "@/lib/ai/openai-sales-agent-request";
import type {
  SalesAgentModel,
  SalesAgentModelRequest,
  SalesAgentModelTurn,
} from "@/lib/ai/sales-agent-model";

export function createOpenAiSalesAgentClient(apiKey: string): SalesAgentModel {
  const client = new OpenAI({ apiKey });

  return {
    async complete(request: SalesAgentModelRequest): Promise<SalesAgentModelTurn> {
      const response = await client.responses.create(buildOpenAiSalesAgentCreateParams(request));

      const functionCalls = response.output.flatMap((item) => {
        if (item.type !== "function_call") {
          return [];
        }
        return [
          {
            callId: item.call_id,
            name: item.name,
            arguments: item.arguments,
          },
        ];
      });

      return {
        responseId: response.id,
        outputText: readOpenAiResponseText(response),
        functionCalls,
        usage: {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          totalTokens: response.usage?.total_tokens ?? null,
        },
      };
    },
  };
}
