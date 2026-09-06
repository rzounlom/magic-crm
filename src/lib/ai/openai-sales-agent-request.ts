import type { SalesAgentModelRequest } from "@/lib/ai/sales-agent-model";

type OpenAiOutputPart = {
  type?: string;
  text?: string;
};

type OpenAiOutputItem = {
  type?: string;
  content?: OpenAiOutputPart[];
};

export function readOpenAiResponseText(response: {
  output_text?: string | null;
  output?: OpenAiOutputItem[];
}): string {
  const direct = response.output_text?.trim() ?? "";
  if (direct) {
    return direct;
  }

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

export function buildOpenAiSalesAgentCreateParams(request: SalesAgentModelRequest) {
  return {
    model: request.model,
    instructions: request.instructions,
    store: false as const,
    max_output_tokens: request.maxOutputTokens,
    input: request.input.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    tools: request.tools.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false as const,
    })),
  };
}
