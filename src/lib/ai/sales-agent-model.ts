export type SalesAgentToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type SalesAgentInputMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SalesAgentFunctionCall = {
  callId: string;
  name: string;
  arguments: string;
};

export type SalesAgentUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type SalesAgentModelRequest = {
  model: string;
  instructions: string;
  input: SalesAgentInputMessage[];
  tools: SalesAgentToolDefinition[];
  maxOutputTokens: number;
};

export type SalesAgentModelTurn = {
  responseId: string;
  outputText: string;
  functionCalls: SalesAgentFunctionCall[];
  usage: SalesAgentUsage;
};

export type SalesAgentModel = {
  complete(request: SalesAgentModelRequest): Promise<SalesAgentModelTurn>;
};
