import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

/**
 * Schema semantico del draft di analisi (§5.4), artifact contrattuale WT-owned.
 *
 * Non è lo schema di trasporto: la route accetta `Type.Unknown()` per non
 * trasformare mai un draft malformato in un 400 Fastify. Questo schema viene
 * applicato nel materializzatore, dove un draft non conforme diventa un
 * `BLOCKED INVALID_DRAFT` diagnosticabile.
 *
 * Bounds allineati al contratto `AlarmAnalysis` manuale: nomi ≤255, note ≤5000,
 * url ≤2000, tipo link ≤50, ignore reason ≤100.
 */

const NAME = Type.String({ minLength: 1, maxLength: 255 });
const TEXT = Type.String({ maxLength: 5000 });

const AnalysisResourceRefSchema = Type.Object(
  {
    name: NAME,
    type: Type.Optional(NAME),
    role: Type.Optional(
      Type.Union([Type.Literal("PRIMARY"), Type.Literal("QUERIED"), Type.Literal("CASE_RELATED")]),
    ),
  },
  { additionalProperties: false },
);

const AnalysisLinkRefSchema = Type.Object(
  {
    url: Type.String({ minLength: 1, maxLength: 2000, pattern: "^https?://" }),
    name: Type.Optional(NAME),
    type: Type.Optional(Type.String({ maxLength: 50 })),
  },
  { additionalProperties: false },
);

const SHARED_REFERENCES = {
  runbookName: Type.Optional(NAME),
  resources: Type.Array(AnalysisResourceRefSchema, { maxItems: 64 }),
  downstreams: Type.Array(NAME, { maxItems: 64 }),
  finalActions: Type.Array(NAME, { maxItems: 64 }),
  links: Type.Array(AnalysisLinkRefSchema, { maxItems: 64 }),
} as const;

export const KnownCaseAnalysisDraftSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    kind: Type.Literal("KNOWN_CASE"),
    conclusionNotes: TEXT,
    errorDetails: Type.Optional(TEXT),
    /**
     * Stato proposto, non stato operativo: l'apply persiste sempre IN_PROGRESS
     * e solo una review CONFIRMED lo promuove (§4.8).
     */
    proposedStatus: Type.Union([Type.Literal("IN_PROGRESS"), Type.Literal("COMPLETED")]),
    analysisType: Type.Union([Type.Literal("ANALYZABLE"), Type.Literal("IGNORABLE")]),
    ignoreReasonCode: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    ignoreDetails: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    ...SHARED_REFERENCES,
  },
  { additionalProperties: false },
);

export const UnknownCaseContextDraftSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    kind: Type.Literal("UNKNOWN_CASE_CONTEXT"),
    ...SHARED_REFERENCES,
  },
  { additionalProperties: false },
);

/** Unione discriminata su `kind`, versionata da `schemaVersion`. */
export const AnalysisDraftV1Schema = Type.Union([
  KnownCaseAnalysisDraftSchema,
  UnknownCaseContextDraftSchema,
]);

export type KnownCaseAnalysisDraft = Static<typeof KnownCaseAnalysisDraftSchema>;
export type UnknownCaseContextDraft = Static<typeof UnknownCaseContextDraftSchema>;
export type AnalysisDraftV1 = Static<typeof AnalysisDraftV1Schema>;

/** Budget raw del draft serializzato (§5.4): oltre ⇒ BLOCKED DRAFT_TOO_LARGE. */
export const ANALYSIS_DRAFT_MAX_BYTES = 64 * 1024;
