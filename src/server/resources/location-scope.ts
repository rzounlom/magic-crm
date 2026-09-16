/**
 * Resources are physical and location-specific.
 * When a location is known, include that location's units plus legacy unscoped rows
 * (locationId null). Never include another location's numbered inventory.
 */
export function resourcesInLocationWhere(locationId: string | null | undefined) {
  if (locationId) {
    return {
      active: true as const,
      OR: [{ locationId }, { locationId: null }],
    };
  }
  return { active: true as const };
}
