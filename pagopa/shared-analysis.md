# Analisi condivisione codice: `@go-watchtower/shared`

**Data**: 2026-03-01
**Autore**: analisi automatica del monorepo
**Scope**: `packages/backend`, `packages/frontend`, `packages/shared`, `packages/database`

---

## Executive Summary

Il monorepo go-watchtower presenta **duplicazione sistematica** tra frontend e backend. Il package `@go-watchtower/shared` attualmente contiene solo 4 file di costanti (system events, system event resources, setting types, setting categories). L'analisi ha identificato **32 candidati alla condivisione** raggruppati in 7 categorie:

| Categoria | Candidati | Priorita Alta | Priorita Media | Priorita Bassa |
|---|---|---|---|---|
| Enumerazioni / costanti di dominio | 8 | 5 | 2 | 1 |
| Tipi di dominio (DTO / response) | 10 | 4 | 4 | 2 |
| Constraint di validazione | 5 | 3 | 2 | 0 |
| Utility pure | 2 | 2 | 0 | 0 |
| Label / mappature UI condivise | 3 | 0 | 2 | 1 |
| Pattern comuni (pagination, error) | 3 | 2 | 1 | 0 |
| Regole di business | 1 | 0 | 0 | 1 |

**Impatto stimato**: eliminazione di ~800 righe di codice duplicato; fonte unica di verita per tutti i valori di dominio; riduzione del rischio di drift tra frontend e backend.

---

## 1. Enumerazioni / costanti di dominio

### 1.1 AnalysisType

**Priorita: ALTA**
**Tipo**: enum / const object

Definito in 3 posti indipendenti:
- **Prisma schema** (`packages/database/prisma/schema.prisma` riga 15-18): `enum AnalysisType { ANALYZABLE, IGNORABLE }`
- **Backend** (`packages/backend/src/routes/analyses/schemas.ts` riga 7-10): TypeBox `Type.Union([Type.Literal("ANALYZABLE"), Type.Literal("IGNORABLE")])`
- **Frontend** (`packages/frontend/src/lib/api-client.ts` riga 337): `type AnalysisType = 'ANALYZABLE' | 'IGNORABLE'`

```typescript
// packages/shared/src/constants/analysis-types.ts

export const AnalysisTypes = {
  ANALYZABLE: 'ANALYZABLE',
  IGNORABLE:  'IGNORABLE',
} as const;

export type AnalysisType = typeof AnalysisTypes[keyof typeof AnalysisTypes];

/** Tutti i valori validi come array (utile per iterazioni e select). */
export const ANALYSIS_TYPE_VALUES = Object.values(AnalysisTypes);
```

**Migration notes**:
- Frontend: sostituire `type AnalysisType = 'ANALYZABLE' | 'IGNORABLE'` in `api-client.ts` con `import type { AnalysisType } from '@go-watchtower/shared'`
- Backend: sostituire `AnalysisTypeSchema` manuale con un helper che genera `Type.Union(...)` dai valori di `AnalysisTypes`
- Prisma: l'enum Prisma resta nel schema.prisma (e vincolato a livello DB), ma il codice applicativo usa la costante shared

---

### 1.2 AnalysisStatus

**Priorita: ALTA**
**Tipo**: enum / const object

Definito in 3 posti:
- **Prisma** (riga 20-24): `enum AnalysisStatus { CREATED, IN_PROGRESS, COMPLETED }`
- **Backend** (`analyses/schemas.ts` riga 22-26): TypeBox union
- **Frontend** (`api-client.ts` riga 376): `type AnalysisStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED'`

```typescript
// packages/shared/src/constants/analysis-statuses.ts

export const AnalysisStatuses = {
  CREATED:     'CREATED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED:   'COMPLETED',
} as const;

export type AnalysisStatus = typeof AnalysisStatuses[keyof typeof AnalysisStatuses];

export const ANALYSIS_STATUS_VALUES = Object.values(AnalysisStatuses);
```

---

### 1.3 PermissionScope

**Priorita: ALTA**
**Tipo**: enum / const object

Definito in 3 posti:
- **Prisma** (riga 40-44): `enum PermissionScope { NONE, OWN, ALL }`
- **Backend** (`users/schemas.ts` riga 3-7 e `permissions/schemas.ts` riga 3-7): TypeBox union (duplicato in 2 schema files!)
- **Frontend** (`api-client.ts` riga 554): `type PermissionScope = "NONE" | "OWN" | "ALL"`

```typescript
// packages/shared/src/constants/permission-scopes.ts

export const PermissionScopes = {
  NONE: 'NONE',
  OWN:  'OWN',
  ALL:  'ALL',
} as const;

export type PermissionScope = typeof PermissionScopes[keyof typeof PermissionScopes];

export const PERMISSION_SCOPE_VALUES = Object.values(PermissionScopes);
```

---

### 1.4 Resource (Permission resources)

**Priorita: ALTA**
**Tipo**: enum / const object

Definito in 2 posti:
- **Prisma** (riga 26-38): `enum Resource { PRODUCT, ENVIRONMENT, ... SYSTEM_SETTING }`
- **Frontend** (`hooks/use-permissions.ts` riga 8-20): `type Resource = 'PRODUCT' | 'ENVIRONMENT' | ...`
- Il backend usa `Resource` importato da `@go-watchtower/database`

```typescript
// packages/shared/src/constants/resources.ts

export const Resources = {
  PRODUCT:         'PRODUCT',
  ENVIRONMENT:     'ENVIRONMENT',
  MICROSERVICE:    'MICROSERVICE',
  IGNORED_ALARM:   'IGNORED_ALARM',
  RUNBOOK:         'RUNBOOK',
  FINAL_ACTION:    'FINAL_ACTION',
  ALARM:           'ALARM',
  ALARM_ANALYSIS:  'ALARM_ANALYSIS',
  DOWNSTREAM:      'DOWNSTREAM',
  USER:            'USER',
  SYSTEM_SETTING:  'SYSTEM_SETTING',
} as const;

export type Resource = typeof Resources[keyof typeof Resources];

export const RESOURCE_VALUES = Object.values(Resources);
```

**Migration notes**:
- Il backend importa gia `Resource` da `@go-watchtower/database` (che re-esporta il Prisma enum). Puo continuare a farlo per le operazioni Prisma, ma il tipo condiviso viene da shared.
- Il frontend (`use-permissions.ts`) elimina il type locale e importa `type Resource` da shared.

---

### 1.5 AuthProvider

**Priorita: MEDIA**
**Tipo**: enum / const object

Definito in:
- **Prisma** (riga 10-13): `enum AuthProvider { LOCAL, GOOGLE }`
- **Backend**: usa `AuthProvider` da database
- **Frontend**: non lo usa direttamente come tipo, ma `provider: string` nel DTO utente

```typescript
// packages/shared/src/constants/auth-providers.ts

export const AuthProviders = {
  LOCAL:  'LOCAL',
  GOOGLE: 'GOOGLE',
} as const;

export type AuthProvider = typeof AuthProviders[keyof typeof AuthProviders];
```

---

### 1.6 Sort Order / Sort Direction

**Priorita: MEDIA**
**Tipo**: costante

Usato in:
- **Backend** (`analyses/schemas.ts` riga 54-62): sortBy fields come literals
- **Frontend** (`api-client.ts` riga 448-449): `sortBy?: string; sortOrder?: string`

```typescript
// packages/shared/src/constants/analysis-sort.ts

export const AnalysisSortFields = {
  ANALYSIS_DATE: 'analysisDate',
  FIRST_ALARM_AT: 'firstAlarmAt',
  LAST_ALARM_AT: 'lastAlarmAt',
  OCCURRENCES: 'occurrences',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
} as const;

export type AnalysisSortField = typeof AnalysisSortFields[keyof typeof AnalysisSortFields];

export const SortDirections = {
  ASC:  'asc',
  DESC: 'desc',
} as const;

export type SortDirection = typeof SortDirections[keyof typeof SortDirections];
```

---

### 1.7 Theme (User Preferences)

**Priorita: BASSA**
**Tipo**: costante

Definito in:
- **Backend** (`users/schemas.ts` riga 126-129): `Type.Union([Type.Literal("light"), Type.Literal("dark"), Type.Literal("system")])`
- **Frontend** (`api-client.ts` riga 631): `theme?: 'light' | 'dark' | 'system'`

```typescript
// packages/shared/src/constants/themes.ts

export const Themes = {
  LIGHT:  'light',
  DARK:   'dark',
  SYSTEM: 'system',
} as const;

export type Theme = typeof Themes[keyof typeof Themes];
```

---

### 1.8 Ignore Reason Code Pattern

**Priorita: ALTA**
**Tipo**: costante / regex

Il pattern per i codici ignore reason e definito in 2 posti:
- **Backend** (`ignore-reasons/schemas.ts` riga 28): `pattern: "^[A-Z_]+$"`
- **Frontend** (`settings/ignore-reasons/_page-content.tsx` riga 58): `z.string().regex(/^[A-Z_]+$/)`

```typescript
// packages/shared/src/constants/ignore-reason-constraints.ts

/** Pattern regex (come stringa) per i codici dei motivi di esclusione. */
export const IGNORE_REASON_CODE_PATTERN = '^[A-Z_]+$';

/** Regex compilata per validazione inline. */
export const IGNORE_REASON_CODE_REGEX = /^[A-Z_]+$/;
```

---

## 2. Tipi di dominio (DTO / Response)

### 2.1 PaginatedResponse<T>

**Priorita: ALTA**
**Tipo**: type / interface

Usato in:
- **Backend** (`analyses/schemas.ts` riga 247-257): `PaginatedAlarmAnalysisResponseSchema`
- **Frontend** (`api-client.ts` riga 433-443): `interface PaginatedResponse<T>`

La struttura di paginazione e identica.

```typescript
// packages/shared/src/types/pagination.ts

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** Vincoli di default per la paginazione. */
export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 200,
} as const;
```

---

### 2.2 RelatedEntity / RelatedUser

**Priorita: ALTA**
**Tipo**: interface

Duplicati in:
- **Backend** (`analyses/schemas.ts` riga 191-200): TypeBox `RelatedUserSchema`, `RelatedEntitySchema`
- **Backend** (`products/schemas.ts` riga 333-336): un altro `RelatedEntitySchema` locale!
- **Frontend** (`api-client.ts` riga 378-387): `interface RelatedUser`, `interface RelatedEntity`

```typescript
// packages/shared/src/types/common.ts

export interface RelatedEntity {
  id: string;
  name: string;
}

export interface RelatedUser {
  id: string;
  name: string;
  email: string;
}
```

---

### 2.3 ErrorResponse / MessageResponse

**Priorita: ALTA**
**Tipo**: interface

Duplicato in **8 file di schema backend** (ogni route file ridefinisce `ErrorResponseSchema` e `MessageResponseSchema`):
- `analyses/schemas.ts` riga 277-283
- `auth/schemas.ts` riga 48-50, 73-75
- `users/schemas.ts` riga 202-208
- `permissions/schemas.ts` riga 20-22
- `products/schemas.ts` riga 359-365
- `reports/schemas.ts` riga 60-62
- `ignore-reasons/schemas.ts` riga 50-51
- `system-events/schemas.ts` riga 45-47
- `settings/schemas.ts` riga 30

```typescript
// packages/shared/src/types/api-responses.ts

export interface ErrorResponse {
  error: string;
}

export interface MessageResponse {
  message: string;
}
```

**Migration notes**: Nel backend, questi andrebbero in un unico `packages/backend/src/schemas/common.ts` che importa i tipi da shared e li wrappa in TypeBox una volta sola.

---

### 2.4 TrackingEntry / Link

**Priorita: MEDIA**
**Tipo**: interface

Usato identico in:
- **Backend** (`analyses/schemas.ts` riga 116-131): `LinkSchema`, `TrackingEntrySchema`
- **Frontend** (`api-client.ts` riga 422-431): `interface TrackingEntry`, tipo inline per links
- **Frontend** (`analysis-form-schemas.ts` riga 75-85): Zod schema per links e tracking

```typescript
// packages/shared/src/types/analysis.ts

export interface AnalysisLink {
  url: string;
  name?: string;
  type?: string;
}

export interface TrackingEntry {
  traceId: string;
  errorCode?: string;
  errorDetail?: string;
  timestamp?: string;
}
```

---

### 2.5 IgnoreReason / IgnoreReasonDetailsSchema

**Priorita: MEDIA**
**Tipo**: interface

Duplicato in:
- **Backend** (`analyses/schemas.ts` riga 12-18 e `ignore-reasons/schemas.ts` riga 5-11): due definizioni TypeBox
- **Frontend** (`api-client.ts` riga 339-360): `interface IgnoreReason`, `interface IgnoreReasonDetailsSchema`, `interface IgnoreReasonFieldDef`

```typescript
// packages/shared/src/types/ignore-reason.ts

export interface IgnoreReasonFieldDef {
  type: 'string' | 'number' | 'boolean';
  title: string;
  description?: string;
  minLength?: number;
  minimum?: number;
  'x-ui'?: 'textarea';
}

export interface IgnoreReasonDetailsSchema {
  type: 'object';
  properties?: Record<string, IgnoreReasonFieldDef>;
  required?: string[];
}

export interface IgnoreReason {
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  detailsSchema: IgnoreReasonDetailsSchema | null;
}
```

---

### 2.6 TimeConstraint (Ignored Alarms)

**Priorita: MEDIA**
**Tipo**: interface

Duplicato in:
- **Backend** (`products/schemas.ts` riga 288-302): TypeBox `TimeConstraintPeriodSchema`, `TimeConstraintHoursSchema`, `TimeConstraintSchema`
- **Frontend** (`api-client.ts` riga 287-301): `interface TimeConstraintPeriod`, `TimeConstraintHours`, `TimeConstraint`

```typescript
// packages/shared/src/types/time-constraint.ts

export interface TimeConstraintPeriod {
  start: string;  // ISO 8601 date-time
  end: string;    // ISO 8601 date-time
}

export interface TimeConstraintHours {
  start: string;  // HH:mm
  end: string;    // HH:mm
}

export interface TimeConstraint {
  periods?: TimeConstraintPeriod[];
  weekdays?: number[];  // 0=dom ... 6=sab
  hours?: TimeConstraintHours[];
}
```

---

### 2.7 ResourcePermission / UserPermissions

**Priorita: MEDIA**
**Tipo**: interface

Duplicato in:
- **Backend** (`permissions/schemas.ts` riga 10-14, `users/schemas.ts` riga 40-45): `ResourcePermissionSchema`, `RolePermissionSchema`
- **Frontend** (`api-client.ts` riga 569-621): `RolePermission`, `ResourcePermission`, `UserPermissions`

```typescript
// packages/shared/src/types/permissions.ts

import type { PermissionScope } from '../constants/permission-scopes.js';
import type { Resource } from '../constants/resources.js';

export interface ResourcePermission {
  canRead: PermissionScope;
  canWrite: PermissionScope;
  canDelete: PermissionScope;
}

export interface RolePermission extends ResourcePermission {
  resource: Resource;
}

export interface UserPermissions {
  [resource: string]: ResourcePermission;
}
```

---

### 2.8 SystemSetting

**Priorita: BASSA**
**Tipo**: interface

Duplicato in:
- **Backend** (`settings/schemas.ts` riga 3-14): TypeBox `SystemSettingSchema`
- **Frontend** (`api-client.ts` riga 750-763): `interface SystemSetting`

```typescript
// packages/shared/src/types/system-setting.ts

import type { SettingType } from '../constants/setting-types.js';
import type { SettingCategory } from '../constants/setting-categories.js';

export interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  type: SettingType;
  category: SettingCategory;
  label: string;
  description: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

### 2.9 SystemEvent

**Priorita: BASSA**
**Tipo**: interface

Duplicato in:
- **Backend** (`system-events/schemas.ts` riga 20-32): TypeBox `SystemEventSchema`
- **Frontend** (`api-client.ts` riga 766-778): `interface SystemEvent`

```typescript
// packages/shared/src/types/system-event.ts

export interface SystemEvent {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  resourceLabel: string | null;
  userId: string | null;
  userLabel: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface SystemEventsResponse {
  data: SystemEvent[];
  total: number;
  page: number;
  totalPages: number;
}
```

---

### 2.10 AnalysisStats (KPI types)

**Priorita: BASSA**
**Tipo**: interface

Duplicato in:
- **Backend** (`analyses/schemas.ts` riga 289-359): TypeBox schemas per stats
- **Frontend** (`api-client.ts` riga 641-698): interface `AnalysisStats`, `KpiStats`, etc.

Troppo grande per essere condiviso integralmente nel primo sprint. Puo essere migrato dopo le interfacce base.

---

## 3. Constraint di validazione

### 3.1 Password minLength (MISMATCH!)

**Priorita: ALTA**
**Tipo**: costante di validazione

**BUG TROVATO**: Le lunghezze minime della password sono **inconsistenti**:
- **Backend register** (`auth/schemas.ts` riga 5): `minLength: 8`
- **Backend create user** (`users/schemas.ts` riga 76): `minLength: 6`
- **Frontend login** (`login-form.tsx` riga 15): `min(1)`
- **Frontend create user** (`users/new/_page-content.tsx` riga 27): `min(6)`

```typescript
// packages/shared/src/constants/validation.ts

/** Vincoli di validazione condivisi tra frontend e backend. */
export const ValidationConstraints = {
  /** Minimo caratteri password per registrazione. */
  PASSWORD_MIN_LENGTH_REGISTER: 8,
  /** Minimo caratteri password per creazione utente admin. */
  PASSWORD_MIN_LENGTH_CREATE: 6,
  /** Lunghezza massima nome utente. */
  USER_NAME_MAX_LENGTH: 255,
  /** Lunghezza minima nome utente. */
  USER_NAME_MIN_LENGTH: 1,
  /** Lunghezza massima nome ruolo. */
  ROLE_NAME_MAX_LENGTH: 50,
  /** Lunghezza massima nome entita generica (prodotto, env, etc.) */
  ENTITY_NAME_MAX_LENGTH: 255,
  /** Minimo occorrenze per analisi. */
  ANALYSIS_OCCURRENCES_MIN: 1,
} as const;
```

---

### 3.2 Pagination Constraints

**Priorita: ALTA**
**Tipo**: costante

Usato in:
- **Backend** (`analyses/schemas.ts` riga 52-53): `minimum: 1, maximum: 200, default: 20`
- **Backend** (`system-events/schemas.ts` riga 13): `minimum: 1, maximum: 200, default: 50`
- **Frontend**: hard-coded nei componenti

Gia proposto in 2.1 (`PAGINATION_DEFAULTS`).

---

### 3.3 Ignore Reason Code regex

**Priorita: ALTA**
**Tipo**: regex / pattern string

Gia proposto in 1.8.

---

### 3.4 Time format HH:mm pattern

**Priorita: MEDIA**
**Tipo**: regex

Usato in:
- **Backend** (`products/schemas.ts` riga 294-296): `pattern: "^\\d{2}:\\d{2}$"`
- Non validato lato frontend (accettato come stringa libera)

```typescript
// packages/shared/src/constants/validation.ts (aggiunta)

export const TIME_HH_MM_PATTERN = '^\\d{2}:\\d{2}$';
export const TIME_HH_MM_REGEX = /^\d{2}:\d{2}$/;
```

---

### 3.5 Weekday range

**Priorita: MEDIA**
**Tipo**: costante

Usato in:
- **Backend** (`products/schemas.ts` riga 300): `Type.Integer({ minimum: 0, maximum: 6 })`

```typescript
// packages/shared/src/constants/validation.ts (aggiunta)

export const WEEKDAY_MIN = 0;
export const WEEKDAY_MAX = 6;
```

---

## 4. Utility pure

### 4.1 `inferLinkType`

**Priorita: ALTA**
**Tipo**: funzione pura

Definita identica in **3 posti**:
- **Backend** (`routes/analyses/index.ts` riga 34-42)
- **Frontend** (`lib/infer-link-type.ts` riga 1-9)
- **Database** (`scripts/import-analyses.ts` riga 111-118)

Tutte le 3 copie sono identiche, trattandosi di logica pura senza dipendenze.

```typescript
// packages/shared/src/utils/infer-link-type.ts

/**
 * Deduce il tipo di link dall'URL (Slack, GitHub, Jira, etc.).
 * Funzione pura senza dipendenze.
 */
export function inferLinkType(url: string): string {
  if (url.includes('slack.com/archives')) return 'Slack Thread';
  if (url.includes('github.com') && url.includes('/issues/')) return 'GitHub Issue';
  if (url.includes('github.com') && url.includes('/pull/')) return 'GitHub PR';
  if (url.includes('.atlassian.net') && url.includes('/browse/')) return 'Jira Ticket';
  if (url.includes('confluence')) return 'Confluence Page';
  if (url.includes('opsgenie.com')) return 'Opsgenie Alert';
  return 'Link';
}
```

**Migration notes**: Eliminare le copie in backend e frontend, importare da `@go-watchtower/shared`. Lo script import-analyses in database puo importare da shared aggiungendo la dipendenza (gia transitiva via backend).

---

### 4.2 `buildDiff`

**Priorita: ALTA**
**Tipo**: funzione pura

Definita in:
- **Backend** (`services/system-event.service.ts` riga 15-31)
- Non usata nel frontend, ma potenzialmente utile per preview delle modifiche lato UI.

La funzione e pura (nessuna dipendenza) e universalmente utile. Potrebbe servire al frontend per mostrare diff nei log eventi o nelle notifiche.

```typescript
// packages/shared/src/utils/build-diff.ts

/**
 * Calcola le differenze tra due oggetti.
 * Restituisce solo i campi effettivamente modificati.
 * Se `fields` e fornito, il confronto e limitato a quei campi.
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[]
): Record<string, { before: unknown; after: unknown }> {
  const keys = fields ?? [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff[key] = { before: b, after: a };
    }
  }
  return diff;
}
```

---

## 5. Label / mappature UI

### 5.1 ANALYSIS_TYPE_LABELS

**Priorita: MEDIA**
**Tipo**: mappatura costante

Duplicata in 2 file frontend:
- `analyses/_lib/constants.ts` riga 6-9
- `dashboard/_components/dashboard/constants.ts` riga 3-6

```typescript
// packages/shared/src/labels/analysis-labels.ts

import type { AnalysisType } from '../constants/analysis-types.js';
import type { AnalysisStatus } from '../constants/analysis-statuses.js';

/** Label italiane per i tipi di analisi. */
export const ANALYSIS_TYPE_LABELS: Record<AnalysisType, string> = {
  ANALYZABLE: 'Analizzabile',
  IGNORABLE:  'Da ignorare',
};

/** Label italiane per gli stati delle analisi. */
export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  CREATED:     'Creata',
  IN_PROGRESS: 'In corso',
  COMPLETED:   'Completata',
};
```

**Nota**: Queste label sono attualmente solo frontend. Spostarle in shared le rende disponibili anche per generazione email/report backend.

---

### 5.2 ACTION_LABELS / RESOURCE_LABELS (System Events)

**Priorita: MEDIA**
**Tipo**: mappatura costante

Definite in:
- **Frontend** (`settings/system-events/_page-content.tsx` riga 92-135): `RESOURCE_LABELS`, `ACTION_LABELS`

Attualmente solo frontend, ma utili anche per report/notifiche backend.

```typescript
// packages/shared/src/labels/system-event-labels.ts

import type { SystemEventAction } from '../constants/system-event-actions.js';
import type { SystemEventResource } from '../constants/system-event-resources.js';

export const SYSTEM_EVENT_RESOURCE_LABELS: Record<SystemEventResource, string> = {
  auth:                      'Auth',
  users:                     'Utenti',
  alarm_analyses:            'Analisi',
  system_settings:           'Impostazioni',
  products:                  'Prodotti',
  alarms:                    'Allarmi',
  ignored_alarms:            'Allarmi Ignorati',
  user_permission_overrides: 'Override Permessi',
};

export const SYSTEM_EVENT_ACTION_LABELS: Partial<Record<SystemEventAction, string>> = {
  USER_LOGIN:                  'Login',
  USER_LOGIN_GOOGLE:           'Login Google',
  USER_LOGIN_FAILED:           'Login Fallito',
  USER_LOGOUT:                 'Logout',
  USER_TOKEN_REVOKED:          'Token Revocato',
  USER_CREATED:                'Utente Creato',
  USER_UPDATED:                'Utente Aggiornato',
  USER_ACTIVATED:              'Utente Attivato',
  USER_DEACTIVATED:            'Utente Disattivato',
  USER_DELETED:                'Utente Eliminato',
  USER_PASSWORD_CHANGED:       'Password Cambiata',
  USER_ROLE_CHANGED:           'Ruolo Cambiato',
  PERMISSION_OVERRIDE_CREATED: 'Override Creato',
  PERMISSION_OVERRIDE_UPDATED: 'Override Aggiornato',
  PERMISSION_OVERRIDE_DELETED: 'Override Eliminato',
  ANALYSIS_CREATED:            'Analisi Creata',
  ANALYSIS_UPDATED:            'Analisi Aggiornata',
  ANALYSIS_DELETED:            'Analisi Eliminata',
  ANALYSIS_STATUS_CHANGED:     'Stato Analisi Cambiato',
  SETTING_UPDATED:             'Impostazione Aggiornata',
  PRODUCT_CREATED:             'Prodotto Creato',
  PRODUCT_UPDATED:             'Prodotto Aggiornato',
  PRODUCT_DELETED:             'Prodotto Eliminato',
  ALARM_CREATED:               'Allarme Creato',
  ALARM_UPDATED:               'Allarme Aggiornato',
  ALARM_DELETED:               'Allarme Eliminato',
  IGNORED_ALARM_CREATED:       'Allarme Ignorato Creato',
  IGNORED_ALARM_UPDATED:       'Allarme Ignorato Aggiornato',
  IGNORED_ALARM_DELETED:       'Allarme Ignorato Eliminato',
};
```

---

### 5.3 ANALYSIS_STATUS_VARIANTS (UI-only)

**Priorita: BASSA**
**Tipo**: mappatura badge variant

Definito in:
- `analyses/_lib/constants.ts` riga 17-21

Questo e puramente UI (badge CSS variant). NON candidato alla condivisione -- deve restare nel frontend.

---

## 6. Pattern comuni

### 6.1 ErrorResponseSchema (backend-internal dedup)

**Priorita: ALTA**
**Tipo**: TypeBox schema

`ErrorResponseSchema` e `MessageResponseSchema` sono definiti **identicamente** in 8 file di schema backend. Questo non e un problema shared ma un problema di dedup interno al backend.

```typescript
// packages/backend/src/schemas/common.ts

import { Type } from '@sinclair/typebox';

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
});

export const MessageResponseSchema = Type.Object({
  message: Type.String(),
});
```

Tutti gli 8 file di route schema eliminano la definizione locale e importano da questo file unico.

---

### 6.2 Pagination defaults coercion

**Priorita: MEDIA**
**Tipo**: costante

Gia coperto in 2.1 (`PAGINATION_DEFAULTS`).

---

### 6.3 PermissionScopeSchema (backend-internal dedup)

**Priorita: ALTA**
**Tipo**: TypeBox schema

`PermissionScopeSchema` e definito identicamente in 2 file backend:
- `users/schemas.ts` riga 3-7
- `permissions/schemas.ts` riga 3-7

Deve essere centralizzato in `packages/backend/src/schemas/common.ts`.

---

## 7. Regole di business

### 7.1 Validation rules (analisi)

**Priorita: BASSA**
**Tipo**: regole di validazione

Le regole in `packages/frontend/src/lib/analysis-validation/rules/validity/analyzable.ts` (es. "ANALYZABLE requires final action", "IGNORABLE requires reason") sono logica di business che potrebbe essere condivisa. Tuttavia:
- Sono attualmente solo lato frontend (post-submit validation UI)
- Il backend non le valida esplicitamente (tutto e opzionale a livello schema)
- Spostarle in shared richiederebbe definire una interfaccia astratta di AlarmAnalysis compatibile con entrambi

**Raccomandazione**: posticipare a un secondo sprint. Prima allineare le regole anche lato backend, poi condividerle.

---

## Roadmap di implementazione

### Sprint 1 - Fondamenta (Priorita ALTA)

**Stima: 2-3 ore**

1. **Costanti di dominio** in `packages/shared/src/constants/`:
   - `analysis-types.ts` (1.1)
   - `analysis-statuses.ts` (1.2)
   - `permission-scopes.ts` (1.3)
   - `resources.ts` (1.4)
   - `validation.ts` (3.1, 3.2) -- include fix del mismatch password
   - `ignore-reason-constraints.ts` (1.8)

2. **Tipi di dominio base** in `packages/shared/src/types/`:
   - `pagination.ts` (2.1)
   - `common.ts` (2.2) -- RelatedEntity, RelatedUser
   - `api-responses.ts` (2.3) -- ErrorResponse, MessageResponse

3. **Utility pure** in `packages/shared/src/utils/`:
   - `infer-link-type.ts` (4.1)
   - `build-diff.ts` (4.2)

4. **Dedup backend-internal**:
   - `packages/backend/src/schemas/common.ts` (6.1, 6.3)

5. Aggiornare `packages/shared/src/index.ts` con tutti i nuovi export.

### Sprint 2 - Tipi di dominio (Priorita MEDIA)

**Stima: 2-3 ore**

1. **Tipi aggiuntivi** in `packages/shared/src/types/`:
   - `analysis.ts` (2.4) -- AnalysisLink, TrackingEntry
   - `ignore-reason.ts` (2.5)
   - `time-constraint.ts` (2.6)
   - `permissions.ts` (2.7)

2. **Costanti aggiuntive**:
   - `auth-providers.ts` (1.5)
   - `analysis-sort.ts` (1.6)
   - `validation.ts` estensione (3.4, 3.5)

3. **Label condivise** in `packages/shared/src/labels/`:
   - `analysis-labels.ts` (5.1)
   - `system-event-labels.ts` (5.2)

4. Migrazione riferimenti nel frontend (`api-client.ts`) e backend.

### Sprint 3 - Allineamento completo (Priorita BASSA)

**Stima: 3-4 ore**

1. **Tipi rimanenti**:
   - `system-setting.ts` (2.8)
   - `system-event.ts` (2.9)
   - Stats/KPI types (2.10)

2. **Costanti residue**:
   - `themes.ts` (1.7)

3. **Regole di business condivise** (7.1) -- richiede preventivo allineamento backend.

4. Cleanup completo: rimuovere tutti i tipi duplicati da `api-client.ts` del frontend (attualmente ~400 righe di tipi che diventeranno re-export da shared).

---

## Considerazioni tecniche

### Compatibilita TypeBox / Zod

Il codebase usa **due sistemi di schema diversi**:
- **Backend**: `@sinclair/typebox` (validazione runtime Fastify)
- **Frontend**: `zod` (validazione form React Hook Form)

**Strategia raccomandata**: I tipi condivisi in `@go-watchtower/shared` sono **plain TypeScript interfaces/types** (zero deps). Ogni lato converte:

```
shared (TS types)
  |                    |
  v                    v
TypeBox schema       Zod schema
(backend)            (frontend)
```

NON aggiungere dipendenze di schema validation a shared. Le costanti `as const` possono essere usate per generare union types in entrambi i framework:

```typescript
// Backend helper (in packages/backend/src/schemas/helpers.ts)
import { Type } from '@sinclair/typebox';

export function literalUnion<T extends readonly string[]>(values: T) {
  return Type.Union(values.map(v => Type.Literal(v)) as any);
}

// Uso:
import { ANALYSIS_TYPE_VALUES } from '@go-watchtower/shared';
const AnalysisTypeSchema = literalUnion(ANALYSIS_TYPE_VALUES);
```

```typescript
// Frontend helper (gia nativo in Zod)
import { z } from 'zod';
import { ANALYSIS_TYPE_VALUES } from '@go-watchtower/shared';
const analysisTypeSchema = z.enum(ANALYSIS_TYPE_VALUES as [string, ...string[]]);
```

### Dipendenze circolari

Il grafo delle dipendenze rimane DAG (no cicli):

```
shared (zero deps)
  |         |
  v         v
database  frontend
  |
  v
backend
```

`shared` NON deve MAI dipendere da `database`, `backend` o `frontend`.

### `verbatimModuleSyntax`

Il tsconfig base ha `verbatimModuleSyntax: true`. Tutti gli export di tipo devono usare `export type { ... }` in statement separati dagli export di valore. Il pattern gia in uso nel package shared (oggetto plurale + tipo singolare) va mantenuto per ogni nuova costante.

### Build order

Il Dockerfile backend gia builda `shared -> database -> backend`. Nessun cambiamento necessario.

### Next.js `transpilePackages`

Il frontend gia ha `transpilePackages: ['@go-watchtower/shared']` in `next.config.ts`. I nuovi file .ts in shared saranno compilati automaticamente da Next.js senza bisogno di pre-build.

---

## Appendice: Inventario duplicazioni per file

| File backend | Duplicazione in frontend | Candidato shared |
|---|---|---|
| `analyses/schemas.ts` riga 7-10 | `api-client.ts` riga 337 | AnalysisType (1.1) |
| `analyses/schemas.ts` riga 22-26 | `api-client.ts` riga 376 | AnalysisStatus (1.2) |
| `analyses/schemas.ts` riga 116-131 | `api-client.ts` riga 422-431 | TrackingEntry, Link (2.4) |
| `analyses/schemas.ts` riga 191-200 | `api-client.ts` riga 378-387 | RelatedEntity, RelatedUser (2.2) |
| `analyses/schemas.ts` riga 247-257 | `api-client.ts` riga 433-443 | PaginatedResponse (2.1) |
| `analyses/schemas.ts` riga 277-283 | (8 file backend) | ErrorResponse (2.3) |
| `users/schemas.ts` riga 3-7 | `api-client.ts` riga 554 | PermissionScope (1.3) |
| `permissions/schemas.ts` riga 3-7 | `api-client.ts` riga 554 | PermissionScope (1.3) |
| `products/schemas.ts` riga 288-302 | `api-client.ts` riga 287-301 | TimeConstraint (2.6) |
| `products/schemas.ts` riga 333-336 | `api-client.ts` riga 384-387 | RelatedEntity (2.2) |
| `analyses/index.ts` riga 34-42 | `lib/infer-link-type.ts` | inferLinkType (4.1) |
| `ignore-reasons/schemas.ts` riga 28 | `settings/ignore-reasons/_page-content.tsx` riga 58 | Pattern regex (1.8) |
| `auth/schemas.ts` riga 5 | `users/new/_page-content.tsx` riga 27 | Password min (3.1) MISMATCH! |
| `system-event.service.ts` riga 15-31 | (non presente frontend) | buildDiff (4.2) |
| n/a (Prisma enum) | `hooks/use-permissions.ts` riga 8-20 | Resource (1.4) |
| `analyses/_lib/constants.ts` riga 6-9 | `dashboard/constants.ts` riga 3-6 | ANALYSIS_TYPE_LABELS (5.1) DUP FRONTEND |

---

## Appendice: Struttura finale proposta per `packages/shared/src/`

```
src/
  constants/
    analysis-types.ts          (NEW)
    analysis-statuses.ts       (NEW)
    analysis-sort.ts           (NEW)
    auth-providers.ts          (NEW)
    ignore-reason-constraints.ts (NEW)
    permission-scopes.ts       (NEW)
    resources.ts               (NEW)
    setting-categories.ts      (EXISTING)
    setting-types.ts           (EXISTING)
    system-event-actions.ts    (EXISTING)
    system-event-resources.ts  (EXISTING)
    validation.ts              (NEW)
  types/
    analysis.ts                (NEW)
    api-responses.ts           (NEW)
    common.ts                  (NEW)
    ignore-reason.ts           (NEW)
    pagination.ts              (NEW)
    permissions.ts             (NEW)
    system-event.ts            (NEW)
    system-setting.ts          (NEW)
    time-constraint.ts         (NEW)
  labels/
    analysis-labels.ts         (NEW)
    system-event-labels.ts     (NEW)
  utils/
    build-diff.ts              (NEW)
    infer-link-type.ts         (NEW)
  index.ts                     (UPDATE - aggiungi tutti i nuovi export)
```

Totale file nuovi: **18**
File modificati: **1** (index.ts)
File esistenti non modificati: **4** (le costanti gia presenti)
