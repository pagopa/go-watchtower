import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALL_QUALITY_RULES,
  ALL_VALIDITY_RULES,
  AUTOMATION_EXEMPT_RULE_IDS,
  assessQuality,
  validateAnalysis,
} from "../dist/index.js";

/** Analisi automatica minimale: date coerenti, una occorrenza, nessun dato opzionale. */
function automaticSubject(overrides = {}) {
  const firedAt = "2026-01-01T10:00:00.000Z";
  return {
    analysisDate: "2026-01-01T10:05:00.000Z",
    firstAlarmAt: firedAt,
    lastAlarmAt: firedAt,
    occurrences: 1,
    isOnCall: false,
    analysisType: "ANALYZABLE",
    ignoreReasonCode: null,
    errorDetails: null,
    conclusionNotes: "Chiusura - caso noto.",
    runbook: null,
    finalActions: [],
    resources: [],
    downstreams: [],
    links: [],
    trackingIds: [],
    linkedEventsCount: 1,
    origin: "AUTOMATIC",
    ...overrides,
  };
}

describe("AUTOMATION_EXEMPT_RULE_IDS", () => {
  it("names only rules that actually exist", () => {
    const registered = new Set([...ALL_VALIDITY_RULES, ...ALL_QUALITY_RULES].map((rule) => rule.id));
    const unknown = [...AUTOMATION_EXEMPT_RULE_IDS].filter((id) => !registered.has(id));

    // Senza questo controllo la rinomina di una regola disattiverebbe l'esenzione
    // in silenzio, facendo ricomparire un errore bloccante su tutte le automatiche.
    assert.deepStrictEqual(unknown, [], `ids esentati inesistenti: ${unknown.join(", ")}`);
  });

  it("exempts exactly twelve rules", () => {
    assert.strictEqual(AUTOMATION_EXEMPT_RULE_IDS.size, 12);
  });
});

describe("exemptions applied by the engine", () => {
  it("does not report the ANALYZABLE reminders on an automatic analysis", () => {
    const result = validateAnalysis(automaticSubject());

    const reported = result.issues.map((issue) => issue.ruleId);
    assert.ok(!reported.includes("ANALYZABLE_REQUIRES_RESOURCE"));
    assert.ok(!reported.includes("ANALYZABLE_REQUIRES_FINAL_ACTION"));
    assert.deepStrictEqual(result.errors, []);
  });

  it("reports them again on the same subject once a human touched it", () => {
    const hybrid = validateAnalysis(automaticSubject({ origin: "HYBRID" }));

    const reported = hybrid.errors.map((issue) => issue.ruleId);
    assert.ok(reported.includes("ANALYZABLE_REQUIRES_RESOURCE"));
    assert.ok(reported.includes("ANALYZABLE_REQUIRES_FINAL_ACTION"));
  });

  it("defaults to the full rule set when origin is absent", () => {
    const subject = automaticSubject();
    delete subject.origin;

    const result = validateAnalysis(subject);

    assert.ok(result.errors.length > 0, "origin assente non deve mai concedere esenzioni");
  });

  it("keeps the intrinsic-correctness rules active on automatic analyses", () => {
    // analysisDate precedente al primo allarme: errore di correttezza, mai esentato.
    const result = validateAnalysis(
      automaticSubject({ analysisDate: "2026-01-01T09:00:00.000Z" }),
    );

    const reported = result.errors.map((issue) => issue.ruleId);
    assert.ok(reported.includes("ANALYSIS_DATE_AFTER_FIRST_ALARM"));
    assert.ok(reported.includes("MTTA_NEGATIVE"));
  });

  it("keeps IGNORABLE_REQUIRES_REASON active on automatic analyses", () => {
    const result = validateAnalysis(automaticSubject({ analysisType: "IGNORABLE" }));

    assert.ok(result.errors.map((issue) => issue.ruleId).includes("IGNORABLE_REQUIRES_REASON"));
  });

  it("drops the exempt quality rules from the automatic score denominator", () => {
    const automatic = assessQuality(automaticSubject());
    const manual = assessQuality(automaticSubject({ origin: "MANUAL" }));

    const automaticIds = automatic.improvements.map((improvement) => improvement.ruleId);
    assert.ok(!automaticIds.includes("QUALITY_DOWNSTREAMS"));
    assert.ok(!automaticIds.includes("QUALITY_RUNBOOK_LINKED"));
    assert.ok(manual.improvements.map((improvement) => improvement.ruleId).includes("QUALITY_DOWNSTREAMS"));
    assert.ok(automatic.score > manual.score, "le esenzioni non devono penalizzare le automatiche");
  });
});
