import type { AnalysisApplyBlockCode } from "../constants/automation.js";

/** Bound applicati in scrittura, così la diagnostica resta leggibile e limitata. */
export const ANALYSIS_APPLY_DIAGNOSTICS_LIMITS = {
  /** Riferimenti non risolti riportati per categoria. */
  MAX_UNRESOLVED_PER_CATEGORY: 32,
  /** Errori e warning riportati, per tipo. */
  MAX_ISSUES: 16,
  /** Lunghezza massima di ogni messaggio di regola. */
  MAX_MESSAGE_LENGTH: 500,
  /** Tetto complessivo del JSON serializzato. */
  MAX_SERIALIZED_BYTES: 8 * 1024,
} as const;

export interface AnalysisApplyRuleIssue {
  readonly ruleId: string;
  readonly message: string;
}

export interface AnalysisApplyUnresolvedReferences {
  readonly resources?: ReadonlyArray<string>;
  readonly downstreams?: ReadonlyArray<string>;
  readonly finalActions?: ReadonlyArray<string>;
  readonly ignoreReasonCode?: string;
}

/**
 * Contratto versionato di `analysis_apply_diagnostics`.
 *
 * Non è JSON informale: UI, metriche e re-apply si appoggiano a questi campi.
 * I codici sono allowlisted e le liste sono limitate (vedi
 * {@link ANALYSIS_APPLY_DIAGNOSTICS_LIMITS}).
 */
export interface AnalysisApplyDiagnosticsV1 {
  readonly schemaVersion: 1;
  /** Presente solo quando l'apply è BLOCKED. */
  readonly blockCode?: AnalysisApplyBlockCode;
  /** Solo evaluate-only su un KNOWN_CASE: cosa sarebbe successo applicando. */
  readonly wouldApplyStatus?: "APPLIED" | "BLOCKED";
  /**
   * Solo evaluate-only su un UNKNOWN_CASE_CONTEXT: misura la validità del
   * contesto, non promette alcuna materializzazione.
   */
  readonly contextValidationStatus?: "VALID" | "INVALID";
  readonly evaluatedOnly?: boolean;
  readonly unresolvedReferences?: AnalysisApplyUnresolvedReferences;
  readonly errors?: ReadonlyArray<AnalysisApplyRuleIssue>;
  readonly warnings?: ReadonlyArray<AnalysisApplyRuleIssue>;
  /** Presente solo per DRAFT_TOO_LARGE: il payload non viene mai persistito. */
  readonly draftDigest?: {
    readonly sha256: string;
    readonly byteLength: number;
  };
}
