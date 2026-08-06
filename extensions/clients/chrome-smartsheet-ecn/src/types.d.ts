export type DomRowSnapshot = {
  pageUrl: string;
  sheetTitle: string;
  rowHint: { rowIndex?: number; primaryValue?: string; ecnNumber?: string };
  captureMode: "dom" | "paste";
  captureState: "complete" | "partial" | "ambiguous";
  observedHeaders: string[];
  fields: Array<{ header: string; ordinal: number; value: unknown }>;
  capturedAt: string;
  captureMeta: {
    missingColumns: string[];
    unexpectedColumns: string[];
    reasons: string[];
  };
};

export type EcnSheetProfile = {
  version: string;
  headerFingerprint: string;
  expectedHeaders: string[];
  headerOrder: string[];
  bindings: Record<string, string>;
  aliases: Record<string, string[]>;
  primaryKeys: string[];
  statusAliases: Record<string, string>;
  locale?: "en" | "ru";
  confirmed?: boolean;
  mappingState?: "ready" | "needs_remap";
};

export type EcnAnalysisResponse = {
  analysisId: string;
  ruleSetVersion: string;
  capture: { state: string; missingColumns: string[] };
  classification: {
    selectedTypes: string[];
    alternatives: string[];
    confidence: number;
    requiresConfirmation: boolean;
  };
  gates: Array<{ stage: string; status: "pass" | "block" | "warning" | "unknown" }>;
  routing: { preApprovers: object[]; reviewers: object[]; recipients: object[] };
  tasks: object[];
  nextAction: object;
  drafts: Record<string, unknown>;
  citations: object[];
};
