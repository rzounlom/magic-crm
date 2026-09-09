import type { EventPlanPayload } from "@/types/event-planner";
import type { PlanResourceRequirement } from "@/types/resource-schedule";

export function applyRotationWindows(
  requirements: PlanResourceRequirement[],
  payload: EventPlanPayload,
): PlanResourceRequirement[] {
  const rotations = payload.rotations ?? [];
  if (rotations.length === 0) {
    return requirements;
  }
  const expanded: PlanResourceRequirement[] = [];
  for (const requirement of requirements) {
    const matching = rotations.flatMap((rotation) =>
      rotation.assignments
        .filter(
          (assignment) =>
            assignment.knowledgeItemId === requirement.knowledgeItemId ||
            assignment.activityName.toLowerCase() === requirement.knowledgeItemName.toLowerCase(),
        )
        .map((assignment) => ({ rotation, assignment })),
    );
    if (matching.length === 0) {
      expanded.push(requirement);
      continue;
    }
    for (const { rotation } of matching) {
      expanded.push({
        ...requirement,
        windowStartTime: rotation.startTime,
        windowEndTime: rotation.endTime,
        rotationNote: requirement.rotationNote,
      });
    }
  }
  return expanded;
}
