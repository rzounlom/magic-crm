export const COMMUNICATION_CHANNELS = {
  EMAIL: "EMAIL",
} as const;

export type CommunicationChannel =
  (typeof COMMUNICATION_CHANNELS)[keyof typeof COMMUNICATION_CHANNELS];

export const COMMUNICATION_KINDS = {
  PLAN_SELECTION_CONFIRMATION: "PLAN_SELECTION_CONFIRMATION",
  BOOKING_CONFIRMATION: "BOOKING_CONFIRMATION",
} as const;

export type CommunicationKind = (typeof COMMUNICATION_KINDS)[keyof typeof COMMUNICATION_KINDS];

export const COMMUNICATION_STATUSES = {
  SKIPPED: "SKIPPED",
  QUEUED: "QUEUED",
  SENT: "SENT",
  FAILED: "FAILED",
} as const;

export type CommunicationStatus =
  (typeof COMMUNICATION_STATUSES)[keyof typeof COMMUNICATION_STATUSES];

export const COMMUNICATION_SKIP_REASONS = {
  NO_EMAIL_PROVIDER: "NO_EMAIL_PROVIDER",
  NO_BOOKING_RECORD: "NO_BOOKING_RECORD",
} as const;

export type CommunicationSkipReason =
  (typeof COMMUNICATION_SKIP_REASONS)[keyof typeof COMMUNICATION_SKIP_REASONS];
