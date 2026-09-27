export type AttractionInterestChoiceSource = {
  id: string;
  organizationId: string;
  label: string;
  description: string | null;
  active: boolean;
  displayOrder: number;
};

export type CustomerAttractionChoice = {
  id: string;
  name: string;
  description: string | null;
};

export function customerAttractionChoices(input: {
  interests: AttractionInterestChoiceSource[];
  organizationId: string;
  fallback: CustomerAttractionChoice[];
}): CustomerAttractionChoice[] {
  const active = input.interests
    .filter((row) => row.organizationId === input.organizationId && row.active)
    .sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label));
  if (active.length === 0) {
    return input.fallback;
  }
  return active.map((row) => ({
    id: row.id,
    name: row.label,
    description: row.description,
  }));
}

export function expandAttractionSelections(input: {
  storedIds: string[];
  interests: Array<{ id: string; productIds: string[] }>;
}): string[] {
  if (input.storedIds.length === 0) {
    return [];
  }
  const productsByInterest = new Map(input.interests.map((row) => [row.id, row.productIds]));
  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const id of input.storedIds) {
    const products = productsByInterest.get(id);
    const candidates = products && products.length > 0 ? products : [id];
    for (const candidate of candidates) {
      if (seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      expanded.push(candidate);
    }
  }
  return expanded;
}

export function attractionSelectionLabels(input: {
  storedIds: string[];
  interests: Array<{ id: string; label: string }>;
  products: Array<{ id: string; name: string }>;
  knowledge: Array<{ id: string; name: string }>;
}): string[] {
  const names = new Map<string, string>();
  for (const row of input.knowledge) {
    names.set(row.id, row.name);
  }
  for (const row of input.products) {
    names.set(row.id, row.name);
  }
  for (const row of input.interests) {
    names.set(row.id, row.label);
  }
  return input.storedIds.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
}
