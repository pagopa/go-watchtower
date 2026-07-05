import {
  AUTOMATIC_RUNBOOK_CATALOG_SCHEMA_VERSION,
  AWS_ACCOUNT_ID_PATTERN,
  AWS_REGION_PATTERN,
  AutomaticRunbookKinds,
  AutomationCatalogHealths,
  CatalogReferenceHealths,
  QUICK_DENY_PREFIX,
  SLACK_INGESTOR_CONTROL_MAX_BYTES,
  SLACK_INGESTOR_CONTROL_SCHEMA_VERSION,
  SLACK_INGESTOR_MAX_MATCHER_VALUES,
  SLACK_INGESTOR_MAX_RULES,
  SlackIngestorExecutionPolicies,
  SlackIngestorIngestionModes,
  SlackIngestorRuleEffects,
  type AutomaticRunbookKind,
} from "../constants/slack-ingestor-automation.js";
import type {
  AutomaticRunbookCatalog,
  AutomaticRunbookDescriptor,
  AutomationCapabilityCatalogHealthInput,
  AutomationCapabilityCatalogHealthResult,
  CatalogReferenceHealthResult,
  CatalogReferenceIssue,
  SlackIngestorAutomationRule,
  SlackIngestorControl,
  SlackIngestorRuleContext,
  SlackIngestorRuleMatcher,
  SlackIngestorScopeEvaluation,
  ValidationIssue,
  ValidationResult,
} from "../types/slack-ingestor-automation.js";

interface UnknownControl {
  schemaVersion?: unknown;
  revision?: unknown;
  ingestionMode?: unknown;
  executionPolicy?: unknown;
  defaultRuleEffect?: unknown;
  rules?: unknown;
}

interface UnknownRule {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  enabled?: unknown;
  effect?: unknown;
  matcher?: unknown;
}

interface UnknownCatalog {
  schemaVersion?: unknown;
  revision?: unknown;
  publishedAt?: unknown;
  environment?: unknown;
  worker?: unknown;
  release?: unknown;
  runbooks?: unknown;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DIGEST_PATTERN = /^sha256-[0-9a-f]{64}$/i;
const MATCHER_KEYS = [
  "channelIds",
  "productIds",
  "environmentIds",
  "alarmIds",
  "alarmNames",
  "runbookKeys",
  "runbookKinds",
  "runbookCategories",
  "awsRegions",
  "awsAccountIds",
  "priorityCodes",
] as const satisfies readonly (keyof SlackIngestorRuleMatcher)[];

export const DEFAULT_SLACK_INGESTOR_CONTROL: SlackIngestorControl = {
  schemaVersion: 1,
  revision: 1,
  ingestionMode: SlackIngestorIngestionModes.ENABLED,
  executionPolicy: SlackIngestorExecutionPolicies.OFF,
  defaultRuleEffect: SlackIngestorRuleEffects.DENY,
  rules: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Solo la lunghezza in byte UTF-8, senza dipendere da TextEncoder (assente
// dalle lib ES pure) o da node:crypto in un package importato dal frontend.
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const symbol of value) {
    const codePoint = symbol.codePointAt(0)!;
    bytes +=
      codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function dateMs(value: Date | string | null): number | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addError(
  errors: ValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  errors.push({ code, path, message });
}

function validateStringArray(
  value: unknown,
  path: string,
  errors: ValidationIssue[],
  pattern?: RegExp,
): value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    addError(
      errors,
      "INVALID_MATCHER_VALUES",
      path,
      "Deve essere un array non vuoto.",
    );
    return false;
  }
  if (value.length > SLACK_INGESTOR_MAX_MATCHER_VALUES) {
    addError(
      errors,
      "TOO_MANY_MATCHER_VALUES",
      path,
      `Massimo ${SLACK_INGESTOR_MAX_MATCHER_VALUES} valori.`,
    );
  }
  const seen = new Set<string>();
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      addError(
        errors,
        "INVALID_MATCHER_VALUE",
        `${path}[${index}]`,
        "Deve essere una stringa non vuota.",
      );
      return;
    }
    if (pattern && !pattern.test(item)) {
      addError(
        errors,
        "INVALID_MATCHER_VALUE",
        `${path}[${index}]`,
        "Formato non valido.",
      );
    }
    if (seen.has(item)) {
      addError(
        errors,
        "DUPLICATE_MATCHER_VALUE",
        `${path}[${index}]`,
        `Valore duplicato: ${item}.`,
      );
    }
    seen.add(item);
  });
  return true;
}

function validateMatcher(
  value: unknown,
  path: string,
  errors: ValidationIssue[],
): value is SlackIngestorRuleMatcher {
  if (!isRecord(value)) {
    addError(
      errors,
      "INVALID_MATCHER",
      path,
      "Il matcher deve essere un oggetto.",
    );
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!MATCHER_KEYS.includes(key as keyof SlackIngestorRuleMatcher)) {
      addError(
        errors,
        "UNKNOWN_MATCHER_DIMENSION",
        `${path}.${key}`,
        "Dimensione matcher sconosciuta.",
      );
    }
  }
  for (const key of MATCHER_KEYS) {
    const item = value[key];
    if (item === undefined) continue;
    const itemPath = `${path}.${key}`;
    if (
      key === "productIds" ||
      key === "environmentIds" ||
      key === "alarmIds"
    ) {
      validateStringArray(item, itemPath, errors, UUID_PATTERN);
    } else if (key === "awsRegions") {
      validateStringArray(item, itemPath, errors, AWS_REGION_PATTERN);
    } else if (key === "awsAccountIds") {
      validateStringArray(item, itemPath, errors, AWS_ACCOUNT_ID_PATTERN);
    } else if (key === "runbookCategories") {
      validateStringArray(item, itemPath, errors, CATEGORY_PATTERN);
    } else if (key === "runbookKinds") {
      if (validateStringArray(item, itemPath, errors)) {
        for (const [index, kind] of item.entries()) {
          if (
            !Object.values(AutomaticRunbookKinds).includes(
              kind as AutomaticRunbookKind,
            )
          ) {
            addError(
              errors,
              "INVALID_RUNBOOK_KIND",
              `${itemPath}[${index}]`,
              `Kind non supportato: ${kind}.`,
            );
          }
        }
      }
    } else {
      validateStringArray(item, itemPath, errors);
    }
  }
  return true;
}

function matcherKeys(matcher: SlackIngestorRuleMatcher): string[] {
  return Object.keys(matcher).filter(
    (key) => matcher[key as keyof SlackIngestorRuleMatcher] !== undefined,
  );
}

export function quickRunbookExclusionId(runbookKey: string): string {
  // La key del runbook e gia un identificatore stabile: usarla in chiaro rende
  // l'id leggibile e deterministico senza bisogno di hashing.
  return `${QUICK_DENY_PREFIX}runbook:${runbookKey}`;
}

export function quickAlarmExclusionId(alarmId: string): string {
  return `${QUICK_DENY_PREFIX}alarm:${alarmId}`;
}

function validateQuickRule(
  rule: SlackIngestorAutomationRule,
  path: string,
  errors: ValidationIssue[],
): void {
  if (!rule.id.startsWith(QUICK_DENY_PREFIX)) return;
  if (!rule.enabled || rule.effect !== SlackIngestorRuleEffects.DENY) {
    addError(
      errors,
      "INVALID_QUICK_EXCLUSION",
      path,
      "Una quick exclusion deve essere abilitata e DENY.",
    );
  }
  const keys = matcherKeys(rule.matcher);
  const runbookKey = rule.matcher.runbookKeys?.[0];
  const alarmId = rule.matcher.alarmIds?.[0];
  const validRunbook =
    keys.length === 1 &&
    keys[0] === "runbookKeys" &&
    rule.matcher.runbookKeys?.length === 1 &&
    runbookKey !== undefined &&
    rule.id === quickRunbookExclusionId(runbookKey);
  const validAlarm =
    keys.length === 1 &&
    keys[0] === "alarmIds" &&
    rule.matcher.alarmIds?.length === 1 &&
    alarmId !== undefined &&
    rule.id === quickAlarmExclusionId(alarmId);
  if (!validRunbook && !validAlarm) {
    addError(
      errors,
      "INVALID_QUICK_EXCLUSION",
      path,
      "ID e matcher della quick exclusion non sono coerenti.",
    );
  }
}

export function validateSlackIngestorControl(
  input: unknown,
  options: { allowGlobalMatchers?: boolean } = {},
): ValidationResult<SlackIngestorControl> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [
        {
          code: "INVALID_CONTROL",
          path: "",
          message: "Il control deve essere un oggetto.",
        },
      ],
      warnings,
    };
  }
  let serializedBytes = Number.POSITIVE_INFINITY;
  try {
    serializedBytes = utf8ByteLength(JSON.stringify(input));
  } catch {
    addError(
      errors,
      "CONTROL_NOT_SERIALIZABLE",
      "",
      "Il control non e serializzabile in JSON.",
    );
  }
  if (serializedBytes > SLACK_INGESTOR_CONTROL_MAX_BYTES) {
    addError(
      errors,
      "CONTROL_TOO_LARGE",
      "",
      `Il control supera ${SLACK_INGESTOR_CONTROL_MAX_BYTES} byte.`,
    );
  }
  const data = input as UnknownControl;
  if (data.schemaVersion !== SLACK_INGESTOR_CONTROL_SCHEMA_VERSION) {
    addError(
      errors,
      "UNSUPPORTED_SCHEMA_VERSION",
      "schemaVersion",
      "schemaVersion deve essere 1.",
    );
  }
  if (!Number.isSafeInteger(data.revision) || (data.revision as number) < 1) {
    addError(
      errors,
      "INVALID_REVISION",
      "revision",
      "revision deve essere un intero positivo.",
    );
  }
  if (
    !Object.values(SlackIngestorIngestionModes).includes(
      data.ingestionMode as never,
    )
  ) {
    addError(
      errors,
      "INVALID_INGESTION_MODE",
      "ingestionMode",
      "ingestionMode non valido.",
    );
  }
  if (
    !Object.values(SlackIngestorExecutionPolicies).includes(
      data.executionPolicy as never,
    )
  ) {
    addError(
      errors,
      "INVALID_EXECUTION_POLICY",
      "executionPolicy",
      "executionPolicy non valida.",
    );
  }
  if (
    !Object.values(SlackIngestorRuleEffects).includes(
      data.defaultRuleEffect as never,
    )
  ) {
    addError(
      errors,
      "INVALID_DEFAULT_RULE_EFFECT",
      "defaultRuleEffect",
      "defaultRuleEffect non valido.",
    );
  }
  if (!Array.isArray(data.rules)) {
    addError(errors, "INVALID_RULES", "rules", "rules deve essere un array.");
  } else {
    if (data.rules.length > SLACK_INGESTOR_MAX_RULES) {
      addError(
        errors,
        "TOO_MANY_RULES",
        "rules",
        `Massimo ${SLACK_INGESTOR_MAX_RULES} regole.`,
      );
    }
    const ids = new Set<string>();
    let manualRuleSeen = false;
    data.rules.forEach((candidate, index) => {
      const path = `rules[${index}]`;
      if (!isRecord(candidate)) {
        addError(
          errors,
          "INVALID_RULE",
          path,
          "La regola deve essere un oggetto.",
        );
        return;
      }
      const ruleInput = candidate as UnknownRule;
      if (typeof ruleInput.id !== "string" || ruleInput.id.trim() === "") {
        addError(errors, "INVALID_RULE_ID", `${path}.id`, "ID obbligatorio.");
      } else if (ids.has(ruleInput.id)) {
        addError(
          errors,
          "DUPLICATE_RULE_ID",
          `${path}.id`,
          `ID duplicato: ${ruleInput.id}.`,
        );
      } else {
        ids.add(ruleInput.id);
      }
      if (typeof ruleInput.name !== "string" || ruleInput.name.trim() === "") {
        addError(
          errors,
          "INVALID_RULE_NAME",
          `${path}.name`,
          "Nome obbligatorio.",
        );
      }
      if (
        ruleInput.description !== undefined &&
        typeof ruleInput.description !== "string"
      ) {
        addError(
          errors,
          "INVALID_RULE_DESCRIPTION",
          `${path}.description`,
          "description deve essere una stringa.",
        );
      }
      if (typeof ruleInput.enabled !== "boolean") {
        addError(
          errors,
          "INVALID_RULE_ENABLED",
          `${path}.enabled`,
          "enabled deve essere booleano.",
        );
      }
      if (
        !Object.values(SlackIngestorRuleEffects).includes(
          ruleInput.effect as never,
        )
      ) {
        addError(
          errors,
          "INVALID_RULE_EFFECT",
          `${path}.effect`,
          "effect non valido.",
        );
      }
      const validMatcher = validateMatcher(
        ruleInput.matcher,
        `${path}.matcher`,
        errors,
      );
      if (!validMatcher) return;
      const rule = candidate as unknown as SlackIngestorAutomationRule;
      const quick =
        typeof rule.id === "string" && rule.id.startsWith(QUICK_DENY_PREFIX);
      if (quick && manualRuleSeen) {
        addError(
          errors,
          "QUICK_EXCLUSION_ORDER",
          `${path}.id`,
          "Le quick exclusion devono precedere le regole manuali.",
        );
      }
      if (!quick) manualRuleSeen = true;
      validateQuickRule(rule, path, errors);
      if (
        matcherKeys(rule.matcher).length === 0 &&
        !options.allowGlobalMatchers
      ) {
        addError(
          errors,
          "GLOBAL_MATCHER_CONFIRMATION_REQUIRED",
          `${path}.matcher`,
          "Un matcher globale richiede conferma esplicita.",
        );
      }
    });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };
  return {
    valid: true,
    value: input as unknown as SlackIngestorControl,
    errors: [],
    warnings,
  };
}

function includesValue(
  values: readonly string[] | undefined,
  value: string | undefined,
): boolean {
  return (
    values === undefined || (value !== undefined && values.includes(value))
  );
}

export function matchesSlackIngestorRule(
  matcher: SlackIngestorRuleMatcher,
  context: SlackIngestorRuleContext,
): boolean {
  return (
    includesValue(matcher.channelIds, context.channelId) &&
    includesValue(matcher.productIds, context.productId) &&
    includesValue(matcher.environmentIds, context.environmentId) &&
    includesValue(matcher.alarmIds, context.alarmId) &&
    includesValue(matcher.alarmNames, context.alarmName) &&
    includesValue(matcher.runbookKeys, context.runbook.key) &&
    includesValue(matcher.runbookKinds, context.runbook.kind) &&
    (matcher.runbookCategories === undefined ||
      matcher.runbookCategories.some((category) =>
        context.runbook.categories.includes(category),
      )) &&
    includesValue(matcher.awsRegions, context.awsRegion) &&
    includesValue(matcher.awsAccountIds, context.awsAccountId) &&
    includesValue(matcher.priorityCodes, context.priorityCode)
  );
}

export function evaluateSlackIngestorScope(
  control: SlackIngestorControl,
  context: SlackIngestorRuleContext,
): SlackIngestorScopeEvaluation {
  for (const rule of control.rules) {
    if (rule.enabled && matchesSlackIngestorRule(rule.matcher, context)) {
      return { effect: rule.effect, matchedRuleId: rule.id };
    }
  }
  return { effect: control.defaultRuleEffect, matchedRuleId: null };
}

export function buildRunbookQuickExclusion(
  runbookKey: string,
): SlackIngestorAutomationRule {
  if (runbookKey.trim() === "") throw new Error("runbookKey must not be empty");
  return {
    id: quickRunbookExclusionId(runbookKey),
    name: `Esclusione globale runbook ${runbookKey}`,
    enabled: true,
    effect: SlackIngestorRuleEffects.DENY,
    matcher: { runbookKeys: [runbookKey] },
  };
}

export function buildAlarmQuickExclusion(
  alarmId: string,
  alarmName?: string,
): SlackIngestorAutomationRule {
  if (!UUID_PATTERN.test(alarmId)) throw new Error("alarmId must be a UUID");
  return {
    id: quickAlarmExclusionId(alarmId),
    name: `Esclusione globale allarme ${alarmName?.trim() || alarmId}`,
    enabled: true,
    effect: SlackIngestorRuleEffects.DENY,
    matcher: { alarmIds: [alarmId] },
  };
}

export interface QuickExclusionMutationResult {
  control: SlackIngestorControl;
  changed: boolean;
}

// Nota: gli helper di mutazione NON toccano la revision. L'unico proprietario
// della revision e il punto di persistenza (saveControl nel backend), che la
// assegna in modo atomico sotto lock ottimistico.
export function addQuickExclusion(
  control: SlackIngestorControl,
  exclusion: SlackIngestorAutomationRule,
): QuickExclusionMutationResult {
  if (control.rules.some((rule) => rule.id === exclusion.id))
    return { control, changed: false };
  const errors: ValidationIssue[] = [];
  validateQuickRule(exclusion, "rule", errors);
  if (!exclusion.id.startsWith(QUICK_DENY_PREFIX) || errors.length > 0) {
    throw new Error("Invalid quick exclusion");
  }
  return {
    changed: true,
    control: { ...control, rules: [exclusion, ...control.rules] },
  };
}

export function removeQuickExclusion(
  control: SlackIngestorControl,
  id: string,
): QuickExclusionMutationResult {
  if (!id.startsWith(QUICK_DENY_PREFIX)) {
    throw new Error("Only quick exclusions can be removed with this helper");
  }
  const rules = control.rules.filter((rule) => rule.id !== id);
  if (rules.length === control.rules.length) return { control, changed: false };
  return { changed: true, control: { ...control, rules } };
}

export function buildOnlyRunbookPreset(
  control: SlackIngestorControl,
  runbookKey: string,
): SlackIngestorControl {
  return {
    ...control,
    defaultRuleEffect: SlackIngestorRuleEffects.DENY,
    rules: [
      {
        id: `preset-only:runbook:${runbookKey}`,
        name: `Solo runbook ${runbookKey}`,
        enabled: true,
        effect: SlackIngestorRuleEffects.ALLOW,
        matcher: { runbookKeys: [runbookKey] },
      },
    ],
  };
}

export function buildOnlyAlarmPreset(
  control: SlackIngestorControl,
  alarmId: string,
  alarmName?: string,
): SlackIngestorControl {
  if (!UUID_PATTERN.test(alarmId)) throw new Error("alarmId must be a UUID");
  return {
    ...control,
    defaultRuleEffect: SlackIngestorRuleEffects.DENY,
    rules: [
      {
        id: `preset-only:alarm:${alarmId}`,
        name: `Solo allarme ${alarmName?.trim() || alarmId}`,
        enabled: true,
        effect: SlackIngestorRuleEffects.ALLOW,
        matcher: { alarmIds: [alarmId] },
      },
    ],
  };
}

export function evaluateCatalogReferenceHealth(
  control: SlackIngestorControl,
  runbooks: readonly AutomaticRunbookDescriptor[],
): CatalogReferenceHealthResult {
  const keys = new Set(runbooks.map((runbook) => runbook.key));
  const kinds = new Set(runbooks.map((runbook) => runbook.kind));
  const categories = new Set(
    runbooks.flatMap((runbook) => runbook.categories),
  );
  const issues: CatalogReferenceIssue[] = [];
  let hasPartial = false;
  let hasFullyUnresolved = false;
  let unsafe = false;
  for (const rule of control.rules) {
    if (!rule.enabled) continue;
    const dimensions = [
      ["runbookKeys", rule.matcher.runbookKeys, keys],
      ["runbookKinds", rule.matcher.runbookKinds, kinds],
      ["runbookCategories", rule.matcher.runbookCategories, categories],
    ] as const;
    for (const [dimension, values, available] of dimensions) {
      if (!values) continue;
      const unresolved = values.filter(
        (value) => !available.has(value as never),
      );
      if (unresolved.length === 0) continue;
      const resolvedCount = values.length - unresolved.length;
      hasPartial ||= resolvedCount > 0;
      hasFullyUnresolved ||= resolvedCount === 0;
      const taxonomyCanFailOpen =
        dimension !== "runbookKeys" &&
        rule.effect === SlackIngestorRuleEffects.DENY &&
        control.defaultRuleEffect === SlackIngestorRuleEffects.ALLOW;
      unsafe ||= taxonomyCanFailOpen;
      issues.push({
        code: "UNRESOLVED_CATALOG_REFERENCE",
        path: `rules.${rule.id}.matcher.${dimension}`,
        message: `Riferimenti catalogo non risolti: ${unresolved.join(", ")}.`,
        ruleId: rule.id,
        dimension,
        values: unresolved,
      });
    }
  }
  const health = unsafe
    ? CatalogReferenceHealths.UNSAFE
    : hasFullyUnresolved
      ? CatalogReferenceHealths.UNRESOLVED
      : hasPartial
        ? CatalogReferenceHealths.PARTIALLY_UNRESOLVED
        : CatalogReferenceHealths.VALID;
  return { health, issues, unsafe };
}

export function deriveAutomationCapabilityCatalogHealth(
  input: AutomationCapabilityCatalogHealthInput,
  now: Date = new Date(),
): AutomationCapabilityCatalogHealthResult {
  const hasCatalog =
    input.revision !== null &&
    input.payload !== null &&
    input.lastVerifiedAt !== null;
  if (!hasCatalog) {
    return {
      health:
        input.lastAttemptAt === null
          ? AutomationCatalogHealths.UNINITIALIZED
          : AutomationCatalogHealths.INVALID,
      usable: false,
    };
  }
  const validUntil = dateMs(input.validUntil);
  if (validUntil === null || validUntil <= now.getTime()) {
    return { health: AutomationCatalogHealths.STALE, usable: false };
  }
  const lastAttempt = dateMs(input.lastAttemptAt);
  const lastVerified = dateMs(input.lastVerifiedAt);
  const degraded =
    input.lastErrorCode !== null &&
    lastAttempt !== null &&
    lastVerified !== null &&
    lastAttempt > lastVerified;
  return {
    health: degraded
      ? AutomationCatalogHealths.DEGRADED
      : AutomationCatalogHealths.HEALTHY,
    usable: true,
  };
}

export function validateAutomaticRunbookCatalog(
  input: unknown,
): ValidationResult<AutomaticRunbookCatalog> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      errors: [
        {
          code: "INVALID_CATALOG",
          path: "",
          message: "Il catalogo deve essere un oggetto.",
        },
      ],
      warnings,
    };
  }
  const data = input as UnknownCatalog;
  for (const key of Object.keys(input)) {
    if (![
      "schemaVersion",
      "revision",
      "publishedAt",
      "environment",
      "worker",
      "release",
      "runbooks",
    ].includes(key)) {
      addError(errors, "UNKNOWN_CATALOG_FIELD", key, `Campo catalogo sconosciuto: ${key}.`);
    }
  }
  if (data.schemaVersion !== AUTOMATIC_RUNBOOK_CATALOG_SCHEMA_VERSION)
    addError(
      errors,
      "UNSUPPORTED_SCHEMA_VERSION",
      "schemaVersion",
      "schemaVersion deve essere 1.",
    );
  if (typeof data.revision !== "string" || !DIGEST_PATTERN.test(data.revision))
    addError(errors, "INVALID_REVISION", "revision", "revision deve essere sha256-<64 hex>.");
  if (
    typeof data.publishedAt !== "string" ||
    !Number.isFinite(Date.parse(data.publishedAt))
  )
    addError(
      errors,
      "INVALID_PUBLISHED_AT",
      "publishedAt",
      "publishedAt deve essere ISO-8601.",
    );
  if (typeof data.environment !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(data.environment))
    addError(
      errors,
      "INVALID_ENVIRONMENT",
      "environment",
      "environment obbligatorio.",
    );
  if (!isRecord(data.worker)) {
    addError(errors, "INVALID_WORKER", "worker", "worker obbligatorio.");
  } else {
    for (const key of Object.keys(data.worker)) {
      if (key !== "artifactRevision" && key !== "commandSchemaVersion")
        addError(errors, "UNKNOWN_WORKER_FIELD", `worker.${key}`, `Campo worker sconosciuto: ${key}.`);
    }
    const artifactRevision = data.worker["artifactRevision"];
    const commandSchemaVersion = data.worker["commandSchemaVersion"];
    if (typeof artifactRevision !== "string" || artifactRevision.trim() === "")
      addError(
        errors,
        "INVALID_ARTIFACT_REVISION",
        "worker.artifactRevision",
        "artifactRevision obbligatoria.",
      );
    if (commandSchemaVersion !== "1.0.0")
      addError(
        errors,
        "INVALID_COMMAND_SCHEMA_VERSION",
        "worker.commandSchemaVersion",
        "commandSchemaVersion deve essere SemVer.",
      );
  }
  if (!isRecord(data.release)) {
    addError(errors, "INVALID_RELEASE", "release", "release obbligatoria.");
  } else {
    for (const key of Object.keys(data.release)) {
      if (key !== "actorArn" && key !== "changeNote")
        addError(errors, "UNKNOWN_RELEASE_FIELD", `release.${key}`, `Campo release sconosciuto: ${key}.`);
    }
    const actorArn = data.release["actorArn"];
    const changeNote = data.release["changeNote"];
    if (typeof actorArn !== "string" || actorArn.trim() === "")
      addError(
        errors,
        "INVALID_ACTOR_ARN",
        "release.actorArn",
        "actorArn obbligatorio.",
      );
    if (typeof changeNote !== "string" || changeNote.trim() === "")
      addError(
        errors,
        "INVALID_CHANGE_NOTE",
        "release.changeNote",
        "changeNote obbligatoria.",
      );
  }
  if (!Array.isArray(data.runbooks)) {
    addError(
      errors,
      "INVALID_RUNBOOKS",
      "runbooks",
      "runbooks deve essere un array.",
    );
  } else {
    const keys = new Set<string>();
    const alarmNames = new Set<string>();
    data.runbooks.forEach((candidate, index) => {
      const path = `runbooks[${index}]`;
      if (!isRecord(candidate)) {
        addError(errors, "INVALID_RUNBOOK", path, "Descriptor non valido.");
        return;
      }
      const descriptor = candidate;
      const descriptorFields = new Set([
        "key", "version", "name", "description", "team", "kind",
        "categories", "tags", "alarmNames", "definitionDigest",
      ]);
      for (const key of Object.keys(descriptor)) {
        if (!descriptorFields.has(key))
          addError(errors, "UNKNOWN_RUNBOOK_FIELD", `${path}.${key}`, `Campo runbook sconosciuto: ${key}.`);
      }
      const keyValue = descriptor["key"];
      const version = descriptor["version"];
      const name = descriptor["name"];
      const description = descriptor["description"];
      const team = descriptor["team"];
      const kind = descriptor["kind"];
      const definitionDigest = descriptor["definitionDigest"];
      if (typeof keyValue !== "string" || keyValue.trim() === "")
        addError(
          errors,
          "INVALID_RUNBOOK_KEY",
          `${path}.key`,
          "key obbligatoria.",
        );
      else if (keys.has(keyValue))
        addError(
          errors,
          "DUPLICATE_RUNBOOK_KEY",
          `${path}.key`,
          `Key duplicata: ${keyValue}.`,
        );
      else keys.add(keyValue);
      if (typeof version !== "string" || !SEMVER_PATTERN.test(version))
        addError(
          errors,
          "INVALID_RUNBOOK_VERSION",
          `${path}.version`,
          "version deve essere SemVer.",
        );
      if (typeof name !== "string" || name.trim() === "")
        addError(
          errors,
          "INVALID_RUNBOOK_NAME",
          `${path}.name`,
          "name obbligatorio.",
        );
      if (typeof description !== "string")
        addError(errors, "INVALID_RUNBOOK_DESCRIPTION", `${path}.description`, "description deve essere una stringa.");
      if (typeof team !== "string" || team.trim() === "")
        addError(errors, "INVALID_RUNBOOK_TEAM", `${path}.team`, "team obbligatorio.");
      if (!Object.values(AutomaticRunbookKinds).includes(kind as never))
        addError(
          errors,
          "INVALID_RUNBOOK_KIND",
          `${path}.kind`,
          "kind non valido.",
        );
      if (
        typeof definitionDigest !== "string" ||
        !DIGEST_PATTERN.test(definitionDigest)
      )
        addError(
          errors,
          "INVALID_DEFINITION_DIGEST",
          `${path}.definitionDigest`,
          "Digest atteso nel formato sha256-<64 hex>.",
        );
      for (const key of ["categories", "tags"] as const) {
        if (
          !Array.isArray(descriptor[key]) ||
          !(descriptor[key] as unknown[]).every(
            (value) => typeof value === "string",
          )
        )
          addError(
            errors,
            `INVALID_${key.toUpperCase()}`,
            `${path}.${key}`,
            `${key} deve essere un array di stringhe.`,
          );
        else if (new Set(descriptor[key] as string[]).size !== (descriptor[key] as string[]).length)
          addError(errors, `DUPLICATE_${key.toUpperCase()}`, `${path}.${key}`, `${key} contiene duplicati.`);
      }
      const descriptorCategories = descriptor["categories"];
      if (Array.isArray(descriptorCategories)) {
        if (descriptorCategories.length === 0)
          addError(errors, "INVALID_CATEGORIES", `${path}.categories`, "categories non puo essere vuoto.");
        descriptorCategories.forEach((category, categoryIndex) => {
          if (typeof category === "string" && !CATEGORY_PATTERN.test(category))
            addError(
              errors,
              "INVALID_CATEGORY",
              `${path}.categories[${categoryIndex}]`,
              "Category non valida.",
            );
        });
      }
      const descriptorAlarmNames = descriptor["alarmNames"];
      if (
        !Array.isArray(descriptorAlarmNames) ||
        descriptorAlarmNames.length === 0
      ) {
        addError(
          errors,
          "INVALID_ALARM_NAMES",
          `${path}.alarmNames`,
          "alarmNames deve essere un array non vuoto.",
        );
      } else {
        descriptorAlarmNames.forEach((alarmName, alarmIndex) => {
          if (typeof alarmName !== "string" || alarmName.trim() === "")
            addError(
              errors,
              "INVALID_ALARM_NAME",
              `${path}.alarmNames[${alarmIndex}]`,
              "Alarm name non valido.",
            );
          else if (alarmNames.has(alarmName))
            addError(
              errors,
              "AMBIGUOUS_ALARM_NAME",
              `${path}.alarmNames[${alarmIndex}]`,
              `Alarm name assegnato piu volte: ${alarmName}.`,
            );
          else alarmNames.add(alarmName);
        });
      }
    });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };
  return {
    valid: true,
    value: input as unknown as AutomaticRunbookCatalog,
    errors: [],
    warnings,
  };
}

