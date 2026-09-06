import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { SalesAgentModel } from "@/lib/ai/sales-agent-model";
import { classifyAiFailure } from "@/server/ai/classify-ai-failure";
import {
  evaluateSalesAgentHandoff,
  HANDOFF_DECLINED_PAYLOAD,
  looksLikeHandoffFarewell,
} from "@/server/ai/handoff-policy";
import { logSalesAgentEvent } from "@/server/logging";
import { salesAgentInstructions } from "@/server/ai/sales-agent-instructions";
import {
  requestHumanHandoffArgsSchema,
  searchSalesKnowledgeArgsSchema,
  SALES_AGENT_TOOL_DEFINITIONS,
  updateInquiryDetailsArgsSchema,
} from "@/server/ai/sales-agent-tools";
import { recordAuditEvent } from "@/server/services/audit";
import { searchActiveSalesKnowledge } from "@/server/services/sales-knowledge-service";
import {
  AI_CUSTOMER_FALLBACK_MESSAGE,
  AI_HANDOFF_CUSTOMER_MESSAGE,
  INQUIRY_STATUSES,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDER_TYPES,
} from "@/types/inquiry";

type AgentDb = PrismaClient;

export type SalesAgentRuntime = {
  model: SalesAgentModel | null;
  modelId: string;
};

export type SalesAgentTurnInput = {
  organizationId: string;
  organizationName: string;
  inquiryId: string;
  conversationId: string;
  trigger: "intake" | "message";
};

const MAX_TOOL_ROUNDS = 4;
const MAX_OUTPUT_TOKENS = 700;

export async function runSalesAgentTurn(
  database: AgentDb,
  runtime: SalesAgentRuntime,
  input: SalesAgentTurnInput,
): Promise<void> {
  const started = Date.now();
  if (!runtime.model) {
    await persistFallback(database, input, {
      errorCode: "AI_DISABLED",
      latencyMs: Date.now() - started,
      modelId: runtime.modelId,
    });
    return;
  }

  let lastResponseId: string | null = null;
  let lastToolName: string | undefined;
  try {
    await database.inquiry.updateMany({
      where: { id: input.inquiryId, organizationId: input.organizationId },
      data: { status: INQUIRY_STATUSES.AI_ENGAGED },
    });

    const history = await database.conversationMessage.findMany({
      where: { organizationId: input.organizationId, conversationId: input.conversationId },
      orderBy: { createdAt: "asc" },
      select: { senderType: true, content: true },
    });

    let shouldHandoff = false;
    let handoffReason: string | null = null;
    let lastText = "";
    let lastUsage = {
      inputTokens: null as number | null,
      outputTokens: null as number | null,
      totalTokens: null as number | null,
    };

    const lastCustomerMessage =
      [...history].reverse().find((message) => message.senderType === MESSAGE_SENDER_TYPES.CUSTOMER)?.content ??
      "";

    const messages = history.map((message) => ({
      role: message.senderType === MESSAGE_SENDER_TYPES.CUSTOMER ? ("user" as const) : ("assistant" as const),
      content: message.content,
    }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const turn = await runtime.model.complete({
        model: runtime.modelId,
        instructions: salesAgentInstructions(input.organizationName),
        input: messages,
        tools: SALES_AGENT_TOOL_DEFINITIONS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
      lastResponseId = turn.responseId;
      lastUsage = turn.usage;
      lastText = turn.outputText;

      if (turn.functionCalls.length === 0) {
        break;
      }

      const toolLines: string[] = [];
      for (const call of turn.functionCalls.slice(0, 4)) {
        lastToolName = call.name;
        const result = await executeAgentTool(database, input, call.name, call.arguments, lastCustomerMessage);
        if (result.handoff) {
          shouldHandoff = true;
          handoffReason = result.handoffReason ?? null;
        }
        toolLines.push(`Tool ${call.name} result: ${JSON.stringify(result.payload)}`);
      }
      messages.push({
        role: "assistant",
        content: turn.outputText || "I used tools to look up tenant information.",
      });
      messages.push({ role: "user", content: toolLines.join("\n") });
    }

    if (!shouldHandoff && looksLikeHandoffFarewell(lastText)) {
      lastText = "";
    }

    if (!lastText.trim() && !shouldHandoff) {
      const finalize = await runtime.model.complete({
        model: runtime.modelId,
        instructions: salesAgentInstructions(input.organizationName),
        input: [
          ...messages,
          {
            role: "user",
            content:
              "Write the customer-facing reply now. Answer the latest customer question. Do not call tools unless a tool is required to answer.",
          },
        ],
        tools: SALES_AGENT_TOOL_DEFINITIONS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
      lastResponseId = finalize.responseId;
      lastUsage = finalize.usage;
      lastText = finalize.outputText;
      if (finalize.functionCalls.length > 0) {
        for (const call of finalize.functionCalls.slice(0, 4)) {
          lastToolName = call.name;
          const result = await executeAgentTool(database, input, call.name, call.arguments, lastCustomerMessage);
          if (result.handoff) {
            shouldHandoff = true;
            handoffReason = result.handoffReason ?? null;
          }
        }
      }
    }

    if (!shouldHandoff && looksLikeHandoffFarewell(lastText)) {
      lastText = "";
    }

    if (shouldHandoff) {
      await persistAgentReply(database, input, {
        content: lastText.trim() || AI_HANDOFF_CUSTOMER_MESSAGE,
        model: runtime.modelId,
        responseId: lastResponseId,
        usage: lastUsage,
        latencyMs: Date.now() - started,
        success: true,
        handoff: true,
        handoffReason,
      });
    } else if (!lastText.trim()) {
      logSalesAgentEvent("sales_agent_empty_output", {
        inquiryId: input.inquiryId,
        conversationId: input.conversationId,
        responseId: lastResponseId,
        model: runtime.modelId,
        failureCategory: "EMPTY_MODEL_OUTPUT",
        toolName: lastToolName,
        latencyMs: Date.now() - started,
        explicitHandoff: false,
      });
      await persistFallback(database, input, {
        errorCode: "EMPTY_MODEL_OUTPUT",
        latencyMs: Date.now() - started,
        modelId: runtime.modelId,
        responseId: lastResponseId,
      });
    } else {
      await persistAgentReply(database, input, {
        content: lastText,
        model: runtime.modelId,
        responseId: lastResponseId,
        usage: lastUsage,
        latencyMs: Date.now() - started,
        success: true,
        handoff: false,
        handoffReason: null,
      });
    }

    if (input.trigger === "intake") {
      await recordAuditEvent(database, {
        organizationId: input.organizationId,
        action: "ai.conversation_started",
        resourceType: "inquiry",
        resourceId: input.inquiryId,
      });
    }
  } catch (error) {
    const classified = classifyAiFailure(error);
    logSalesAgentEvent("sales_agent_turn_failed", {
      inquiryId: input.inquiryId,
      conversationId: input.conversationId,
      responseId: lastResponseId,
      model: runtime.modelId,
      failureCategory: classified.category,
      httpStatus: classified.httpStatus,
      toolName: lastToolName,
      latencyMs: Date.now() - started,
      explicitHandoff: false,
    });
    await persistFallback(database, input, {
      errorCode: classified.category,
      latencyMs: Date.now() - started,
      modelId: runtime.modelId,
      responseId: lastResponseId,
    });
  }
}

async function executeAgentTool(
  database: AgentDb,
  input: SalesAgentTurnInput,
  name: string,
  rawArgs: string,
  lastCustomerMessage: string,
): Promise<{ payload: unknown; handoff?: boolean; handoffReason?: string | null }> {
  try {
    return await executeAgentToolUnchecked(database, input, name, rawArgs, lastCustomerMessage);
  } catch {
    logSalesAgentEvent("sales_agent_tool_failed", {
      inquiryId: input.inquiryId,
      conversationId: input.conversationId,
      model: undefined,
      failureCategory: "TOOL_FAILED",
      toolName: name,
      explicitHandoff: false,
    });
    return { payload: { error: "TOOL_FAILED", toolName: name } };
  }
}

async function executeAgentToolUnchecked(
  database: AgentDb,
  input: SalesAgentTurnInput,
  name: string,
  rawArgs: string,
  lastCustomerMessage: string,
): Promise<{ payload: unknown; handoff?: boolean; handoffReason?: string | null }> {
  if (name === "search_sales_knowledge") {
    const args = searchSalesKnowledgeArgsSchema.parse(safeJson(rawArgs));
    const items = await searchActiveSalesKnowledge(database, input.organizationId, args);
    return {
      payload: items.map((item) => ({
        name: item.name,
        type: item.type,
        shortDescription: item.shortDescription,
        details: item.details,
        priceText: item.priceText,
        durationMinutes: item.durationMinutes,
        minGuests: item.minGuests,
        maxGuests: item.maxGuests,
        waiverRequired: item.waiverRequired,
        customerFacingNotes: item.customerFacingNotes,
        salesNotes: item.salesNotes,
      })),
    };
  }

  if (name === "get_inquiry_details") {
    const inquiry = await database.inquiry.findFirst({
      where: { id: input.inquiryId, organizationId: input.organizationId },
    });
    if (!inquiry) {
      return { payload: { error: "Inquiry not found" } };
    }
    return {
      payload: {
        status: inquiry.status,
        customerFirstName: inquiry.customerFirstName,
        customerLastName: inquiry.customerLastName,
        customerEmail: inquiry.customerEmail,
        customerPhone: inquiry.customerPhone,
        eventType: inquiry.eventType,
        desiredDate: inquiry.desiredDate?.toISOString().slice(0, 10) ?? null,
        desiredStartTime: inquiry.desiredStartTime,
        guestCount: inquiry.guestCount,
        childGuestCount: inquiry.childGuestCount,
        adultGuestCount: inquiry.adultGuestCount,
        budgetMin: inquiry.budgetMin,
        budgetMax: inquiry.budgetMax,
        occasion: inquiry.occasion,
        customerNotes: inquiry.customerNotes,
        internalSummary: inquiry.internalSummary,
      },
    };
  }

  if (name === "update_inquiry_details") {
    const args = updateInquiryDetailsArgsSchema.parse(safeJson(rawArgs));
    const data: Prisma.InquiryUncheckedUpdateManyInput = {};
    if (args.eventType !== undefined) data.eventType = args.eventType;
    if (args.desiredDate !== undefined) {
      data.desiredDate = args.desiredDate ? new Date(`${args.desiredDate}T00:00:00.000Z`) : null;
    }
    if (args.desiredStartTime !== undefined) data.desiredStartTime = args.desiredStartTime;
    if (args.guestCount !== undefined) data.guestCount = args.guestCount;
    if (args.childGuestCount !== undefined) data.childGuestCount = args.childGuestCount;
    if (args.adultGuestCount !== undefined) data.adultGuestCount = args.adultGuestCount;
    if (args.budgetMin !== undefined) data.budgetMin = args.budgetMin;
    if (args.budgetMax !== undefined) data.budgetMax = args.budgetMax;
    if (args.occasion !== undefined) data.occasion = args.occasion;
    if (args.customerNotes !== undefined) data.customerNotes = args.customerNotes;
    if (args.internalSummary !== undefined) data.internalSummary = args.internalSummary;
    const updated = Object.keys(data);
    if (updated.length > 0) {
      await database.inquiry.updateMany({
        where: { id: input.inquiryId, organizationId: input.organizationId },
        data,
      });
    }
    return { payload: { updated } };
  }

  if (name === "request_human_handoff") {
    const args = requestHumanHandoffArgsSchema.parse(safeJson(rawArgs));
    const decision = evaluateSalesAgentHandoff({ lastCustomerMessage });
    if (!decision.allow) {
      logSalesAgentEvent("sales_agent_handoff_declined", {
        inquiryId: input.inquiryId,
        conversationId: input.conversationId,
        toolName: name,
        failureCategory: decision.category,
        explicitHandoff: false,
      });
      return { payload: HANDOFF_DECLINED_PAYLOAD };
    }
    await database.inquiry.updateMany({
      where: { id: input.inquiryId, organizationId: input.organizationId },
      data: {
        status: INQUIRY_STATUSES.READY_FOR_HUMAN,
        aiHandlingEnabled: false,
        humanHandoffRequestedAt: new Date(),
        humanHandoffReason: args.reason,
        internalSummary: args.summary,
      },
    });
    await recordAuditEvent(database, {
      organizationId: input.organizationId,
      action: "ai.handoff_requested",
      resourceType: "inquiry",
      resourceId: input.inquiryId,
      metadata: { urgency: args.urgency ?? "normal" },
    });
    return { payload: { handedOff: true }, handoff: true, handoffReason: args.reason };
  }

  return { payload: { error: "Unknown tool" } };
}

async function persistAgentReply(
  database: AgentDb,
  input: SalesAgentTurnInput,
  result: {
    content: string;
    model: string;
    responseId: string | null;
    usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null };
    latencyMs: number;
    success: boolean;
    handoff: boolean;
    handoffReason: string | null;
  },
) {
  await database.conversationMessage.create({
    data: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      direction: MESSAGE_DIRECTIONS.OUTBOUND,
      senderType: MESSAGE_SENDER_TYPES.AI,
      content: result.content,
      aiModel: result.model,
      aiResponseId: result.responseId,
      metadata: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
    },
  });
  await database.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: new Date() },
  });
  await database.aiUsage.create({
    data: {
      organizationId: input.organizationId,
      inquiryId: input.inquiryId,
      conversationId: input.conversationId,
      model: result.model,
      responseId: result.responseId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      latencyMs: result.latencyMs,
      success: result.success,
    },
  });

  if (!result.handoff) {
    await database.inquiry.updateMany({
      where: {
        id: input.inquiryId,
        organizationId: input.organizationId,
        status: { not: INQUIRY_STATUSES.READY_FOR_HUMAN },
      },
      data: { status: INQUIRY_STATUSES.AWAITING_CUSTOMER },
    });
  }

  await recordAuditEvent(database, {
    organizationId: input.organizationId,
    action: "ai.message_generated",
    resourceType: "inquiry",
    resourceId: input.inquiryId,
    metadata: { success: result.success, handoff: result.handoff },
  });
}

async function persistFallback(
  database: AgentDb,
  input: SalesAgentTurnInput,
  details: {
    errorCode: string;
    latencyMs: number;
    modelId: string;
    responseId?: string | null;
  },
) {
  await database.conversationMessage.create({
    data: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      direction: MESSAGE_DIRECTIONS.OUTBOUND,
      senderType: MESSAGE_SENDER_TYPES.SYSTEM,
      content: AI_CUSTOMER_FALLBACK_MESSAGE,
    },
  });
  await database.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: new Date() },
  });
  await database.inquiry.updateMany({
    where: {
      id: input.inquiryId,
      organizationId: input.organizationId,
      status: { not: INQUIRY_STATUSES.READY_FOR_HUMAN },
    },
    data: {
      status: INQUIRY_STATUSES.NEEDS_FOLLOW_UP,
    },
  });
  await database.aiUsage.create({
    data: {
      organizationId: input.organizationId,
      inquiryId: input.inquiryId,
      conversationId: input.conversationId,
      model: details.modelId,
      responseId: details.responseId ?? null,
      latencyMs: details.latencyMs,
      success: false,
      errorCode: details.errorCode,
    },
  });
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
