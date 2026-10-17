export const SCENARIO_LAB_RUN_STATUSES = {
  INITIALIZED: "initialized",
  READY: "ready",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type ScenarioLabRunStatus =
  (typeof SCENARIO_LAB_RUN_STATUSES)[keyof typeof SCENARIO_LAB_RUN_STATUSES];

export const SCENARIO_LAB_TEMPLATE_KEYS = {
  CUSTOMER_SUBMITS_INQUIRY: "customer_submits_inquiry",
  PLACE_HOLD: "place_hold",
  CONFIRM_BOOKING: "confirm_booking",
  CONFLICT_SAFETY: "conflict_safety",
} as const;

export type ScenarioLabTemplateKey =
  (typeof SCENARIO_LAB_TEMPLATE_KEYS)[keyof typeof SCENARIO_LAB_TEMPLATE_KEYS];

export type ScenarioLabTemplateDefinition = {
  key: ScenarioLabTemplateKey;
  name: string;
  description: string;
  available: boolean;
};

export const SCENARIO_LAB_TEMPLATES: readonly ScenarioLabTemplateDefinition[] = [
  {
    key: SCENARIO_LAB_TEMPLATE_KEYS.CUSTOMER_SUBMITS_INQUIRY,
    name: "Customer submits an inquiry",
    description: "Stage a realistic public inquiry through the real MagicCRM intake form.",
    available: true,
  },
  {
    key: SCENARIO_LAB_TEMPLATE_KEYS.PLACE_HOLD,
    name: "Place a HOLD",
    description: "Coming later.",
    available: false,
  },
  {
    key: SCENARIO_LAB_TEMPLATE_KEYS.CONFIRM_BOOKING,
    name: "Confirm a booking",
    description: "Coming later.",
    available: false,
  },
  {
    key: SCENARIO_LAB_TEMPLATE_KEYS.CONFLICT_SAFETY,
    name: "Conflict safety",
    description: "Coming later.",
    available: false,
  },
] as const;

export const SCENARIO_LAB_ENTITY_TYPES = {
  INQUIRY: "inquiry",
} as const;

export const SCENARIO_LAB_TIMELINE_KINDS = {
  OPERATOR_ACTION: "operator_action",
  OBSERVED_STATE: "observed_state",
  EXPECTED_FUTURE: "expected_future",
  NOT_YET_PERFORMED: "not_yet_performed",
} as const;

export type ScenarioLabTimelineKind =
  (typeof SCENARIO_LAB_TIMELINE_KINDS)[keyof typeof SCENARIO_LAB_TIMELINE_KINDS];

export type ScenarioLabTimelineEntry = {
  id: string;
  at: string;
  kind: ScenarioLabTimelineKind;
  code: string;
  message: string;
};

export function isScenarioLabRunStatus(value: string): value is ScenarioLabRunStatus {
  return (Object.values(SCENARIO_LAB_RUN_STATUSES) as string[]).includes(value);
}

export function scenarioLabTemplateByKey(
  key: string,
): ScenarioLabTemplateDefinition | undefined {
  return SCENARIO_LAB_TEMPLATES.find((template) => template.key === key);
}

export function formatScenarioLabStatus(status: string): string {
  switch (status) {
    case SCENARIO_LAB_RUN_STATUSES.INITIALIZED:
      return "Initialized";
    case SCENARIO_LAB_RUN_STATUSES.READY:
      return "Ready";
    case SCENARIO_LAB_RUN_STATUSES.RUNNING:
      return "Running";
    case SCENARIO_LAB_RUN_STATUSES.COMPLETED:
      return "Completed";
    case SCENARIO_LAB_RUN_STATUSES.FAILED:
      return "Failed";
    default:
      return status;
  }
}
