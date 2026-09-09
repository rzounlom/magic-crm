export type InquiryNoteSignals = {
  wantedTerms: string[];
  unwantedTerms: string[];
  wantsPrivateRoom: boolean;
  youngerKids: boolean;
  teamBuilding: boolean;
  casual: boolean;
  awardsTime: boolean;
  dinnerTogether: boolean;
};

const STOP = new Set(["the", "and", "for", "with", "that", "this", "have", "want", "really", "just"]);
const TERM = "([a-z0-9]+(?:\\s+(?!we\\b|and\\b|but\\b|because\\b)[a-z0-9]+){0,2})";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function parseInquiryNotes(notes: string | null | undefined): InquiryNoteSignals {
  const text = normalize(notes ?? "");
  const unwantedTerms: string[] = [];
  const wantedTerms: string[] = [];

  const negative = new RegExp(
    `\\b(?:do not want|don't want|dont want|not interested in|please no|do not|don't|dont|no)\\s+${TERM}`,
    "g",
  );
  for (const match of text.matchAll(negative)) {
    const term = (match[1] ?? "").trim();
    if (term) {
      unwantedTerms.push(term);
    }
  }

  const positive = new RegExp(
    `\\b(?:really want|want|need|prefer|interested in)\\s+${TERM}`,
    "g",
  );
  for (const match of text.matchAll(positive)) {
    const term = (match[1] ?? "").trim();
    if (term && !unwantedTerms.some((unwanted) => term.includes(unwanted) || unwanted.includes(term))) {
      wantedTerms.push(term);
    }
  }

  return {
    wantedTerms: wantedTerms.filter((term) => !term.split(" ").every((word) => STOP.has(word))),
    unwantedTerms,
    wantsPrivateRoom: /\bprivate (room|space)\b/.test(text),
    youngerKids: /\b(younger kids|little kids|small children|young children)\b/.test(text),
    teamBuilding: /\bteam[- ]?building\b/.test(text),
    casual: /\bcasual\b/.test(text),
    awardsTime: /\bawards?\b/.test(text),
    dinnerTogether: /\b(dinner|everyone together|together for food)\b/.test(text),
  };
}

export function notesExcludeItem(name: string, signals: InquiryNoteSignals): boolean {
  const haystack = normalize(name);
  return signals.unwantedTerms.some((term) => haystack.includes(term) || term.includes(haystack));
}

export function notesPreferItem(name: string, signals: InquiryNoteSignals): boolean {
  const haystack = normalize(name);
  return signals.wantedTerms.some((term) => haystack.includes(term) || term.includes(haystack));
}
