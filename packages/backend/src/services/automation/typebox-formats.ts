import { FormatRegistry } from "@sinclair/typebox";

/**
 * Registra i format usati dalla validazione standalone `Value.Check` (la pipeline
 * HTTP Fastify usa Ajv con i propri format; `Value` è un validatore separato e non
 * conosce i format finché non vengono registrati). Import side-effect idempotente.
 */

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// RFC3339 / ISO 8601 date-time con offset o Z.
const DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (value) => UUID_RE.test(value));
}

if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set(
    "date-time",
    (value) => DATE_TIME_RE.test(value) && !Number.isNaN(Date.parse(value)),
  );
}

export const TYPEBOX_FORMATS_REGISTERED = true;
