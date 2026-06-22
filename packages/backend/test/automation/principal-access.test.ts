import assert from "node:assert/strict";
import test from "node:test";
import {
  canHumanLogin,
  canServiceLogin,
  evaluateHumanGuard,
  evaluateServiceGuard,
  verifyServiceTokenClaims,
} from "../../src/services/automation/principal-access.js";

const HUMAN = { principalType: "HUMAN" as const, serviceId: null, isActive: true };
const SERVICE = { principalType: "SERVICE" as const, serviceId: "runbook-automation-worker", isActive: true };

test("login gating: HUMAN can human-login but not service-login; SERVICE the reverse", () => {
  assert.equal(canHumanLogin(HUMAN), true);
  assert.equal(canServiceLogin(HUMAN), false);
  assert.equal(canServiceLogin(SERVICE), true);
  assert.equal(canHumanLogin(SERVICE), false);
});

test("login gating: inactive principals cannot log in", () => {
  assert.equal(canHumanLogin({ ...HUMAN, isActive: false }), false);
  assert.equal(canServiceLogin({ ...SERVICE, isActive: false }), false);
});

test("requireHumanPrincipal: SERVICE rejected, inactive rejected", () => {
  assert.equal(evaluateHumanGuard(HUMAN).allowed, true);
  const svc = evaluateHumanGuard(SERVICE);
  assert.equal(svc.allowed, false);
  if (!svc.allowed) assert.equal(svc.code, "PRINCIPAL_TYPE_NOT_ALLOWED");
  const inactive = evaluateHumanGuard({ ...HUMAN, isActive: false });
  assert.equal(inactive.allowed, false);
});

test("requireService: only the exact serviceId passes; HUMAN never passes", () => {
  assert.equal(evaluateServiceGuard(SERVICE, "runbook-automation-worker").allowed, true);
  const wrongId = evaluateServiceGuard({ ...SERVICE, serviceId: "other" }, "runbook-automation-worker");
  assert.equal(wrongId.allowed, false);
  if (!wrongId.allowed) assert.equal(wrongId.code, "SERVICE_ID_NOT_ALLOWED");
  const human = evaluateServiceGuard(HUMAN, "runbook-automation-worker");
  assert.equal(human.allowed, false);
  if (!human.allowed) assert.equal(human.code, "PRINCIPAL_TYPE_NOT_ALLOWED");
  assert.equal(evaluateServiceGuard({ ...SERVICE, isActive: false }, "runbook-automation-worker").allowed, false);
});

test("verifyServiceTokenClaims: enforces principalType + aud + iss", () => {
  const expected = { audience: "watchtower-automation", issuer: "go-watchtower" };
  assert.equal(
    verifyServiceTokenClaims({ principalType: "SERVICE", aud: "watchtower-automation", iss: "go-watchtower" }, expected).allowed,
    true,
  );
  assert.equal(verifyServiceTokenClaims({ principalType: "HUMAN", aud: "watchtower-automation", iss: "go-watchtower" }, expected).allowed, false);
  assert.equal(verifyServiceTokenClaims({ principalType: "SERVICE", aud: "wrong", iss: "go-watchtower" }, expected).allowed, false);
  assert.equal(verifyServiceTokenClaims({ principalType: "SERVICE", aud: "watchtower-automation", iss: "wrong" }, expected).allowed, false);
});
