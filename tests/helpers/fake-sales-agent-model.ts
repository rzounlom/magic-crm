import type {
  SalesAgentModel,
  SalesAgentModelRequest,
  SalesAgentModelTurn,
} from "@/lib/ai/sales-agent-model";

export type FakeSalesAgentScript = (request: SalesAgentModelRequest) => SalesAgentModelTurn | Promise<SalesAgentModelTurn>;

export function createFakeSalesAgentModel(script?: FakeSalesAgentScript): SalesAgentModel & {
  requests: SalesAgentModelRequest[];
} {
  const requests: SalesAgentModelRequest[] = [];
  return {
    requests,
    async complete(request) {
      requests.push(request);
      if (script) {
        return script(request);
      }
      return {
        responseId: `resp_${requests.length}`,
        outputText: "Thanks for reaching out. What date works best for your event?",
        functionCalls: [],
        usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
      };
    },
  };
}

export function failingSalesAgentModel(error: unknown): SalesAgentModel {
  return {
    async complete() {
      throw error;
    },
  };
}
