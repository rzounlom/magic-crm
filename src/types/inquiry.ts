export const INQUIRY_STATUSES = {
  NEW: "NEW",
  AI_ENGAGED: "AI_ENGAGED",
  AWAITING_CUSTOMER: "AWAITING_CUSTOMER",
  NEEDS_FOLLOW_UP: "NEEDS_FOLLOW_UP",
  READY_FOR_HUMAN: "READY_FOR_HUMAN",
  DECLINED: "DECLINED",
  BOOKED: "BOOKED",
} as const;

export type InquiryStatus = (typeof INQUIRY_STATUSES)[keyof typeof INQUIRY_STATUSES];

export const INQUIRY_SOURCES = {
  WEB: "WEB",
  EMAIL: "EMAIL",
  SMS: "SMS",
} as const;

export type InquirySource = (typeof INQUIRY_SOURCES)[keyof typeof INQUIRY_SOURCES];

export const CONVERSATION_CHANNELS = {
  WEB: "WEB",
  EMAIL: "EMAIL",
  SMS: "SMS",
} as const;

export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[keyof typeof CONVERSATION_CHANNELS];

export const MESSAGE_DIRECTIONS = {
  INBOUND: "INBOUND",
  OUTBOUND: "OUTBOUND",
} as const;

export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[keyof typeof MESSAGE_DIRECTIONS];

export const MESSAGE_SENDER_TYPES = {
  CUSTOMER: "CUSTOMER",
  AI: "AI",
  EMPLOYEE: "EMPLOYEE",
  SYSTEM: "SYSTEM",
} as const;

export type MessageSenderType = (typeof MESSAGE_SENDER_TYPES)[keyof typeof MESSAGE_SENDER_TYPES];

export const SALES_KNOWLEDGE_TYPES = {
  ATTRACTION: "ATTRACTION",
  PACKAGE: "PACKAGE",
  ADD_ON: "ADD_ON",
  FOOD_BEVERAGE: "FOOD_BEVERAGE",
  POLICY: "POLICY",
  FAQ: "FAQ",
} as const;

export type SalesKnowledgeType = (typeof SALES_KNOWLEDGE_TYPES)[keyof typeof SALES_KNOWLEDGE_TYPES];

export const DEFAULT_OPENAI_SALES_MODEL = "gpt-4.1-mini";

export const AI_CUSTOMER_FALLBACK_MESSAGE =
  "Thanks — I received your message. I wasn't able to finish that response just now. You can try another message, and a team member can also follow up if needed.";

export const AI_HANDOFF_CUSTOMER_MESSAGE =
  "I've passed this to a team member who can help from here.";

export const PUBLIC_INTAKE_LIMITS = {
  name: 80,
  email: 254,
  phone: 32,
  eventType: 80,
  occasion: 120,
  notes: 2000,
  message: 2000,
  guestCount: 500,
} as const;
