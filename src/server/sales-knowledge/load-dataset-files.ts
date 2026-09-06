import { readFileSync } from "node:fs";
import path from "node:path";

import {
  parseSalesKnowledgeDataset,
  type SalesKnowledgeDatasetParseResult,
} from "@/server/sales-knowledge/dataset";

export const DEFAULT_SALES_KNOWLEDGE_DATASET_DIR = path.join(
  process.cwd(),
  "scripts/data/generations-sales-knowledge",
);

export function loadSalesKnowledgeDatasetFromDirectory(
  directory = DEFAULT_SALES_KNOWLEDGE_DATASET_DIR,
): SalesKnowledgeDatasetParseResult {
  const knowledge = JSON.parse(readFileSync(path.join(directory, "sales-knowledge.json"), "utf8"));
  const needsVerification = JSON.parse(
    readFileSync(path.join(directory, "needs-verification.json"), "utf8"),
  );
  return parseSalesKnowledgeDataset({ knowledge, needsVerification });
}
