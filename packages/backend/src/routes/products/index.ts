import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  prisma,
  SystemComponent,
  type Environment,
  type Runbook,
  type FinalAction,
  type Alarm,
  type Downstream,
} from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { buildDiff } from "../../services/system-event.service.js";
import {
  SystemEventActions,
  SystemEventResources,
  SLACK_CHANNEL_ID_PATTERN,
  AWS_ACCOUNT_ID_PATTERN,
  AWS_REGION_PATTERN,
  SLACK_PARSER_IDS,
} from "@go-watchtower/shared";
import { HttpError } from "../../utils/http-errors.js";
import { validateRegexPattern } from "../../utils/validate-regex.js";
import { buildDispatchDeps } from "../../services/automation/reconciler-scheduler.js";
import { registerFilterOptionsRoutes } from "./filter-options-routes.js";
import { registerIgnoredAlarmRoutes } from "./ignored-alarm-routes.js";
import { registerProductCoreRoutes } from "./product-core-routes.js";
import {
  CreateEnvironmentBodySchema,
  UpdateEnvironmentBodySchema,
  EnvironmentParamsSchema,
  ProductIdParamsSchema,
  EnvironmentResponseSchema,
  EnvironmentsResponseSchema,
  CreateResourceBodySchema,
  UpdateResourceBodySchema,
  ResourceParamsSchema,
  ResourceResponseSchema,
  ResourcesResponseSchema,
  CreateRunbookBodySchema,
  UpdateRunbookBodySchema,
  RunbookParamsSchema,
  RunbookResponseSchema,
  RunbooksResponseSchema,
  CreateFinalActionBodySchema,
  UpdateFinalActionBodySchema,
  FinalActionParamsSchema,
  FinalActionResponseSchema,
  FinalActionsResponseSchema,
  CreateAlarmBodySchema,
  UpdateAlarmBodySchema,
  AlarmParamsSchema,
  AlarmResponseSchema,
  AlarmsResponseSchema,
  CreateDownstreamBodySchema,
  UpdateDownstreamBodySchema,
  DownstreamParamsSchema,
  DownstreamResponseSchema,
  DownstreamsResponseSchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  type CreateEnvironmentBody,
  type UpdateEnvironmentBody,
  type EnvironmentParams,
  type ProductIdParams,
  type CreateResourceBody,
  type UpdateResourceBody,
  type ResourceParams,
  type CreateRunbookBody,
  type UpdateRunbookBody,
  type RunbookParams,
  type CreateFinalActionBody,
  type UpdateFinalActionBody,
  type FinalActionParams,
  type CreateAlarmBody,
  type UpdateAlarmBody,
  type AlarmParams,
  type CreateDownstreamBody,
  type UpdateDownstreamBody,
  type DownstreamParams,
} from "./schemas.js";

const SLACK_PARSERS = new Set<string>(SLACK_PARSER_IDS);

function validateSlackEnvironment(value: {
  slackIngestorEnabled: boolean;
  slackChannelId: string | null;
  slackParserId: string | null;
  defaultAwsAccountId: string | null;
  defaultAwsRegion: string | null;
}): string | null {
  if (value.slackChannelId && !SLACK_CHANNEL_ID_PATTERN.test(value.slackChannelId)) return "slackChannelId non valido";
  if (value.slackParserId && !SLACK_PARSERS.has(value.slackParserId)) return "slackParserId non supportato";
  if (value.defaultAwsAccountId && !AWS_ACCOUNT_ID_PATTERN.test(value.defaultAwsAccountId)) return "defaultAwsAccountId deve contenere 12 cifre";
  if (value.defaultAwsRegion && !AWS_REGION_PATTERN.test(value.defaultAwsRegion)) return "defaultAwsRegion non valida";
  if (value.slackIngestorEnabled && (!value.slackChannelId || !value.slackParserId || !value.defaultAwsAccountId || !value.defaultAwsRegion)) {
    return "Per abilitare lo Slack Ingestor servono channel, parser, account e region";
  }
  return null;
}

async function validateSlackRegionOnboarding(enabled: boolean, region: string | null): Promise<string | null> {
  if (!enabled || !region) return null;
  // Registry non configurato = modalità db-only (nessun dispatch SQS): l'ingestione
  // resta abilitabile, il routing viene comunque segnalato nella UI dei canali.
  const deps = buildDispatchDeps();
  if (!deps) return null;
  const resolution = await deps.registry.resolveQueue(region);
  return resolution.kind === "OK" ? null : `Region ${region} non onboardata nel queue registry (${resolution.kind})`;
}

export async function productRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();
  await registerProductCoreRoutes(fastify);
  await registerFilterOptionsRoutes(fastify);
  await registerIgnoredAlarmRoutes(fastify);

  // ============================================================================
  // ENVIRONMENTS
  // ============================================================================

  // List environments for a product
  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/environments",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ENVIRONMENT,"read")],
      schema: {
        tags: ["environments"],
        summary: "Get all environments for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: EnvironmentsResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const environments = await prisma.environment.findMany({
          where: { productId: request.params.productId },
          orderBy: [{ order: "asc" }, { name: "asc" }],
        });

        reply.send(
          environments.map((e: Environment) => ({
            id:                  e.id,
            name:                e.name,
            description:         e.description,
            order:               e.order,
            productId:           e.productId,
            slackChannelId:      e.slackChannelId ?? null,
            defaultAwsAccountId: e.defaultAwsAccountId ?? null,
            defaultAwsRegion:    e.defaultAwsRegion ?? null,
            slackIngestorEnabled: e.slackIngestorEnabled,
            slackParserId:       e.slackParserId ?? null,
            onCallAlarmPattern:  e.onCallAlarmPattern ?? null,
            createdAt:           e.createdAt.toISOString(),
            updatedAt:           e.updatedAt.toISOString(),
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch environments";
        HttpError.internal(reply, message);
      }
    }
  );

  // Create environment
  app.post<{ Params: ProductIdParams; Body: CreateEnvironmentBody }>(
    "/products/:productId/environments",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ENVIRONMENT,"write")],
      schema: {
        tags: ["environments"],
        summary: "Create a new environment",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateEnvironmentBodySchema,
        response: {
          201: EnvironmentResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        if (request.body.onCallAlarmPattern) {
          const regexError = validateRegexPattern(request.body.onCallAlarmPattern);
          if (regexError) {
            return HttpError.badRequest(reply, `onCallAlarmPattern: ${regexError}`);
          }
        }
        const slackError = validateSlackEnvironment({
          slackIngestorEnabled: request.body.slackIngestorEnabled ?? false,
          slackChannelId: request.body.slackChannelId ?? null,
          slackParserId: request.body.slackParserId ?? null,
          defaultAwsAccountId: request.body.defaultAwsAccountId ?? null,
          defaultAwsRegion: request.body.defaultAwsRegion ?? null,
        });
        if (slackError) return HttpError.badRequest(reply, slackError);
        const regionError = await validateSlackRegionOnboarding(request.body.slackIngestorEnabled ?? false, request.body.defaultAwsRegion ?? null);
        if (regionError) return HttpError.badRequest(reply, regionError);

        const environment = await prisma.environment.create({
          data: {
            name:                request.body.name,
            description:         request.body.description,
            order:               request.body.order ?? 0,
            productId:           request.params.productId,
            slackChannelId:      request.body.slackChannelId,
            defaultAwsAccountId: request.body.defaultAwsAccountId,
            defaultAwsRegion:    request.body.defaultAwsRegion,
            slackIngestorEnabled: request.body.slackIngestorEnabled ?? false,
            slackParserId:       request.body.slackParserId,
            onCallAlarmPattern:  request.body.onCallAlarmPattern,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.ENVIRONMENT_CREATED,
          resource: SystemEventResources.ENVIRONMENTS,
          resourceId: environment.id,
          resourceLabel: environment.name,
          metadata: { created: environment },
        });

        reply.status(201).send({
          id:                  environment.id,
          name:                environment.name,
          description:         environment.description,
          order:               environment.order,
          productId:           environment.productId,
          slackChannelId:      environment.slackChannelId ?? null,
          defaultAwsAccountId: environment.defaultAwsAccountId ?? null,
          defaultAwsRegion:    environment.defaultAwsRegion ?? null,
          slackIngestorEnabled: environment.slackIngestorEnabled,
          slackParserId:       environment.slackParserId ?? null,
          onCallAlarmPattern:  environment.onCallAlarmPattern ?? null,
          createdAt:           environment.createdAt.toISOString(),
          updatedAt:           environment.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create environment";
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Update environment
  app.put<{ Params: EnvironmentParams; Body: UpdateEnvironmentBody }>(
    "/products/:productId/environments/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ENVIRONMENT,"write")],
      schema: {
        tags: ["environments"],
        summary: "Update an environment",
        security: [{ bearerAuth: [] }],
        params: EnvironmentParamsSchema,
        body: UpdateEnvironmentBodySchema,
        response: {
          200: EnvironmentResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        if (request.body.onCallAlarmPattern) {
          const regexError = validateRegexPattern(request.body.onCallAlarmPattern);
          if (regexError) {
            return HttpError.badRequest(reply, `onCallAlarmPattern: ${regexError}`);
          }
        }

        const existingEnv = await prisma.environment.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true, description: true, order: true, slackChannelId: true, defaultAwsAccountId: true, defaultAwsRegion: true, slackIngestorEnabled: true, slackParserId: true, onCallAlarmPattern: true },
        });

        if (!existingEnv) return HttpError.notFound(reply, "Environment");
        const slackError = validateSlackEnvironment({
          slackIngestorEnabled: request.body.slackIngestorEnabled ?? existingEnv.slackIngestorEnabled,
          slackChannelId: request.body.slackChannelId === undefined ? existingEnv.slackChannelId : request.body.slackChannelId,
          slackParserId: request.body.slackParserId === undefined ? existingEnv.slackParserId : request.body.slackParserId,
          defaultAwsAccountId: request.body.defaultAwsAccountId === undefined ? existingEnv.defaultAwsAccountId : request.body.defaultAwsAccountId,
          defaultAwsRegion: request.body.defaultAwsRegion === undefined ? existingEnv.defaultAwsRegion : request.body.defaultAwsRegion,
        });
        if (slackError) return HttpError.badRequest(reply, slackError);
        const mergedEnabled = request.body.slackIngestorEnabled ?? existingEnv.slackIngestorEnabled;
        const mergedRegion = request.body.defaultAwsRegion === undefined ? existingEnv.defaultAwsRegion : request.body.defaultAwsRegion;
        const regionError = await validateSlackRegionOnboarding(mergedEnabled, mergedRegion);
        if (regionError) return HttpError.badRequest(reply, regionError);

        const environment = await prisma.environment.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            name:                request.body.name,
            description:         request.body.description,
            order:               request.body.order,
            slackChannelId:      request.body.slackChannelId,
            defaultAwsAccountId: request.body.defaultAwsAccountId,
            defaultAwsRegion:    request.body.defaultAwsRegion,
            slackIngestorEnabled: request.body.slackIngestorEnabled,
            slackParserId:       request.body.slackParserId,
            onCallAlarmPattern:  request.body.onCallAlarmPattern,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.ENVIRONMENT_UPDATED,
          resource: SystemEventResources.ENVIRONMENTS,
          resourceId: environment.id,
          resourceLabel: environment.name,
          metadata: {
            productId: request.params.productId,
            changes: buildDiff(
              { name: existingEnv?.name, description: existingEnv?.description, order: existingEnv?.order },
              { name: environment.name, description: environment.description, order: environment.order },
            ),
          },
        });

        reply.send({
          id:                  environment.id,
          name:                environment.name,
          description:         environment.description,
          order:               environment.order,
          productId:           environment.productId,
          slackChannelId:      environment.slackChannelId ?? null,
          defaultAwsAccountId: environment.defaultAwsAccountId ?? null,
          defaultAwsRegion:    environment.defaultAwsRegion ?? null,
          slackIngestorEnabled: environment.slackIngestorEnabled,
          slackParserId:       environment.slackParserId ?? null,
          onCallAlarmPattern:  environment.onCallAlarmPattern ?? null,
          createdAt:           environment.createdAt.toISOString(),
          updatedAt:           environment.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update environment";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Environment");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Delete environment
  app.delete<{ Params: EnvironmentParams }>(
    "/products/:productId/environments/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ENVIRONMENT,"delete")],
      schema: {
        tags: ["environments"],
        summary: "Delete an environment",
        security: [{ bearerAuth: [] }],
        params: EnvironmentParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const envToDelete = await prisma.environment.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true },
        });

        await prisma.environment.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.ENVIRONMENT_DELETED,
          resource: SystemEventResources.ENVIRONMENTS,
          resourceId: request.params.id,
          resourceLabel: envToDelete?.name ?? null,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Environment deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete environment";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Environment");
        }
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // RESOURCES
  // ============================================================================

  // List resources for a product
  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/resources",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.RESOURCE, "read")],
      schema: {
        tags: ["resources"],
        summary: "Get all resources for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: ResourcesResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const resources = await prisma.resource.findMany({
          where: { productId: request.params.productId },
          include: { type: { select: { id: true, name: true } } },
          orderBy: { name: "asc" },
        });

        reply.send(
          resources.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            typeId: r.typeId,
            type: r.type,
            productId: r.productId,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch resources";
        HttpError.internal(reply, message);
      }
    }
  );

  // Create resource
  app.post<{ Params: ProductIdParams; Body: CreateResourceBody }>(
    "/products/:productId/resources",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.RESOURCE, "write")],
      schema: {
        tags: ["resources"],
        summary: "Create a new resource",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateResourceBodySchema,
        response: {
          201: ResourceResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const resource = await prisma.resource.create({
          data: {
            name: request.body.name,
            description: request.body.description,
            typeId: request.body.typeId,
            productId: request.params.productId,
          },
          include: { type: { select: { id: true, name: true } } },
        });

        request.auditEvents.push({
          action: SystemEventActions.RESOURCE_CREATED,
          resource: SystemEventResources.RESOURCES,
          resourceId: resource.id,
          resourceLabel: resource.name,
          metadata: { created: resource },
        });

        reply.status(201).send({
          id: resource.id,
          name: resource.name,
          description: resource.description,
          typeId: resource.typeId,
          type: resource.type,
          productId: resource.productId,
          createdAt: resource.createdAt.toISOString(),
          updatedAt: resource.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create resource";
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Update resource
  app.put<{ Params: ResourceParams; Body: UpdateResourceBody }>(
    "/products/:productId/resources/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.RESOURCE, "write")],
      schema: {
        tags: ["resources"],
        summary: "Update a resource",
        security: [{ bearerAuth: [] }],
        params: ResourceParamsSchema,
        body: UpdateResourceBodySchema,
        response: {
          200: ResourceResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existingRes = await prisma.resource.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true, description: true, typeId: true },
        });

        const resource = await prisma.resource.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            ...(request.body.name !== undefined && { name: request.body.name }),
            ...(request.body.description !== undefined && { description: request.body.description }),
            ...(request.body.typeId !== undefined && { typeId: request.body.typeId }),
          },
          include: { type: { select: { id: true, name: true } } },
        });

        request.auditEvents.push({
          action: SystemEventActions.RESOURCE_UPDATED,
          resource: SystemEventResources.RESOURCES,
          resourceId: resource.id,
          resourceLabel: resource.name,
          metadata: {
            productId: request.params.productId,
            changes: buildDiff(
              { name: existingRes?.name, description: existingRes?.description, typeId: existingRes?.typeId },
              { name: resource.name, description: resource.description, typeId: resource.typeId },
            ),
          },
        });

        reply.send({
          id: resource.id,
          name: resource.name,
          description: resource.description,
          typeId: resource.typeId,
          type: resource.type,
          productId: resource.productId,
          createdAt: resource.createdAt.toISOString(),
          updatedAt: resource.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update resource";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Resource");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Delete resource
  app.delete<{ Params: ResourceParams }>(
    "/products/:productId/resources/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.RESOURCE, "delete")],
      schema: {
        tags: ["resources"],
        summary: "Delete a resource",
        security: [{ bearerAuth: [] }],
        params: ResourceParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const resToDelete = await prisma.resource.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true },
        });

        await prisma.resource.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.RESOURCE_DELETED,
          resource: SystemEventResources.RESOURCES,
          resourceId: request.params.id,
          resourceLabel: resToDelete?.name ?? null,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Resource deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete resource";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Resource");
        }
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // RUNBOOKS
  // ============================================================================

  // List runbooks for a product
  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/runbooks",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.RUNBOOK, "read")],
      schema: {
        tags: ["runbooks"],
        summary: "Get all runbooks for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: RunbooksResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const runbooks = await prisma.runbook.findMany({
          where: { productId: request.params.productId },
          orderBy: { name: "asc" },
        });

        reply.send(
          runbooks.map((r: Runbook) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            link: r.link,
            status: r.status,
            productId: r.productId,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch runbooks";
        HttpError.internal(reply, message);
      }
    }
  );

  // Create runbook
  app.post<{ Params: ProductIdParams; Body: CreateRunbookBody }>(
    "/products/:productId/runbooks",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.RUNBOOK, "write")],
      schema: {
        tags: ["runbooks"],
        summary: "Create a new runbook",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateRunbookBodySchema,
        response: {
          201: RunbookResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const runbook = await prisma.runbook.create({
          data: {
            name: request.body.name,
            description: request.body.description,
            link: request.body.link,
            status: request.body.status,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.RUNBOOK_CREATED,
          resource: SystemEventResources.RUNBOOKS,
          resourceId: runbook.id,
          resourceLabel: runbook.name,
          metadata: { created: runbook },
        });

        reply.status(201).send({
          id: runbook.id,
          name: runbook.name,
          description: runbook.description,
          link: runbook.link,
          status: runbook.status,
          productId: runbook.productId,
          createdAt: runbook.createdAt.toISOString(),
          updatedAt: runbook.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create runbook";
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Update runbook
  app.put<{ Params: RunbookParams; Body: UpdateRunbookBody }>(
    "/products/:productId/runbooks/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.RUNBOOK, "write")],
      schema: {
        tags: ["runbooks"],
        summary: "Update a runbook",
        security: [{ bearerAuth: [] }],
        params: RunbookParamsSchema,
        body: UpdateRunbookBodySchema,
        response: {
          200: RunbookResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existingRunbook = await prisma.runbook.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true, description: true, link: true, status: true },
        });

        const runbook = await prisma.runbook.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            name: request.body.name,
            description: request.body.description,
            link: request.body.link,
            status: request.body.status,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.RUNBOOK_UPDATED,
          resource: SystemEventResources.RUNBOOKS,
          resourceId: runbook.id,
          resourceLabel: runbook.name,
          metadata: {
            productId: request.params.productId,
            changes: buildDiff(
              { name: existingRunbook?.name, description: existingRunbook?.description, link: existingRunbook?.link, status: existingRunbook?.status },
              { name: runbook.name, description: runbook.description, link: runbook.link, status: runbook.status },
            ),
          },
        });

        reply.send({
          id: runbook.id,
          name: runbook.name,
          description: runbook.description,
          link: runbook.link,
          status: runbook.status,
          productId: runbook.productId,
          createdAt: runbook.createdAt.toISOString(),
          updatedAt: runbook.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update runbook";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Runbook");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Delete runbook
  app.delete<{ Params: RunbookParams }>(
    "/products/:productId/runbooks/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.RUNBOOK, "delete")],
      schema: {
        tags: ["runbooks"],
        summary: "Delete a runbook",
        security: [{ bearerAuth: [] }],
        params: RunbookParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const runbookToDelete = await prisma.runbook.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true },
        });

        await prisma.runbook.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.RUNBOOK_DELETED,
          resource: SystemEventResources.RUNBOOKS,
          resourceId: request.params.id,
          resourceLabel: runbookToDelete?.name ?? null,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Runbook deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete runbook";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Runbook");
        }
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // FINAL ACTIONS
  // ============================================================================

  // List final actions for a product
  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/final-actions",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.FINAL_ACTION, "read")],
      schema: {
        tags: ["final-actions"],
        summary: "Get all final actions for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: FinalActionsResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const finalActions = await prisma.finalAction.findMany({
          where: { productId: request.params.productId },
          orderBy: [{ order: "asc" }, { name: "asc" }],
        });

        reply.send(
          finalActions.map((fa: FinalAction) => ({
            id: fa.id,
            name: fa.name,
            description: fa.description,
            order: fa.order,
            isOther: fa.isOther,
            productId: fa.productId,
            createdAt: fa.createdAt.toISOString(),
            updatedAt: fa.updatedAt.toISOString(),
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch final actions";
        HttpError.internal(reply, message);
      }
    }
  );

  // Create final action
  app.post<{ Params: ProductIdParams; Body: CreateFinalActionBody }>(
    "/products/:productId/final-actions",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.FINAL_ACTION, "write")],
      schema: {
        tags: ["final-actions"],
        summary: "Create a new final action",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateFinalActionBodySchema,
        response: {
          201: FinalActionResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const finalAction = await prisma.finalAction.create({
          data: {
            name: request.body.name,
            description: request.body.description,
            order: request.body.order ?? 0,
            isOther: request.body.isOther ?? false,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.FINAL_ACTION_CREATED,
          resource: SystemEventResources.FINAL_ACTIONS,
          resourceId: finalAction.id,
          resourceLabel: finalAction.name,
          metadata: { created: finalAction },
        });

        reply.status(201).send({
          id: finalAction.id,
          name: finalAction.name,
          description: finalAction.description,
          order: finalAction.order,
          isOther: finalAction.isOther,
          productId: finalAction.productId,
          createdAt: finalAction.createdAt.toISOString(),
          updatedAt: finalAction.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create final action";
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Update final action
  app.put<{ Params: FinalActionParams; Body: UpdateFinalActionBody }>(
    "/products/:productId/final-actions/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.FINAL_ACTION, "write")],
      schema: {
        tags: ["final-actions"],
        summary: "Update a final action",
        security: [{ bearerAuth: [] }],
        params: FinalActionParamsSchema,
        body: UpdateFinalActionBodySchema,
        response: {
          200: FinalActionResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existingFa = await prisma.finalAction.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true, description: true, order: true, isOther: true },
        });

        const finalAction = await prisma.finalAction.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            name: request.body.name,
            description: request.body.description,
            order: request.body.order,
            isOther: request.body.isOther,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.FINAL_ACTION_UPDATED,
          resource: SystemEventResources.FINAL_ACTIONS,
          resourceId: finalAction.id,
          resourceLabel: finalAction.name,
          metadata: {
            productId: request.params.productId,
            changes: buildDiff(
              { name: existingFa?.name, description: existingFa?.description, order: existingFa?.order, isOther: existingFa?.isOther },
              { name: finalAction.name, description: finalAction.description, order: finalAction.order, isOther: finalAction.isOther },
            ),
          },
        });

        reply.send({
          id: finalAction.id,
          name: finalAction.name,
          description: finalAction.description,
          order: finalAction.order,
          isOther: finalAction.isOther,
          productId: finalAction.productId,
          createdAt: finalAction.createdAt.toISOString(),
          updatedAt: finalAction.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update final action";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Final action");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Delete final action
  app.delete<{ Params: FinalActionParams }>(
    "/products/:productId/final-actions/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.FINAL_ACTION, "delete")],
      schema: {
        tags: ["final-actions"],
        summary: "Delete a final action",
        security: [{ bearerAuth: [] }],
        params: FinalActionParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const faToDelete = await prisma.finalAction.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true },
        });

        await prisma.finalAction.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.FINAL_ACTION_DELETED,
          resource: SystemEventResources.FINAL_ACTIONS,
          resourceId: request.params.id,
          resourceLabel: faToDelete?.name ?? null,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Final action deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete final action";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Final action");
        }
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // ALARMS
  // ============================================================================

  // List alarms for a product
  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/alarms",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM, "read")],
      schema: {
        tags: ["alarms"],
        summary: "Get all alarms for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: AlarmsResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const alarms = await prisma.alarm.findMany({
          where: { productId: request.params.productId },
          include: { runbook: { select: { id: true, name: true } } },
          orderBy: { name: "asc" },
        });

        reply.send(
          alarms.map((a: Alarm & { runbook: { id: string; name: string } | null }) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            runbookId: a.runbookId,
            runbook: a.runbook,
            productId: a.productId,
            createdAt: a.createdAt.toISOString(),
            updatedAt: a.updatedAt.toISOString(),
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch alarms";
        HttpError.internal(reply, message);
      }
    }
  );

  // Create alarm
  app.post<{ Params: ProductIdParams; Body: CreateAlarmBody }>(
    "/products/:productId/alarms",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM, "write")],
      schema: {
        tags: ["alarms"],
        summary: "Create a new alarm",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateAlarmBodySchema,
        response: {
          201: AlarmResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const alarm = await prisma.alarm.create({
          data: {
            name: request.body.name,
            description: request.body.description,
            runbookId: request.body.runbookId || null,
            productId: request.params.productId,
          },
          include: { runbook: { select: { id: true, name: true } } },
        });

        request.auditEvents.push({
          action: SystemEventActions.ALARM_CREATED,
          resource: SystemEventResources.ALARMS,
          resourceId: alarm.id,
          resourceLabel: alarm.name,
          metadata: { created: alarm },
        });

        reply.status(201).send({
          id: alarm.id,
          name: alarm.name,
          description: alarm.description,
          runbookId: alarm.runbookId,
          runbook: alarm.runbook,
          productId: alarm.productId,
          createdAt: alarm.createdAt.toISOString(),
          updatedAt: alarm.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create alarm";
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Update alarm
  app.put<{ Params: AlarmParams; Body: UpdateAlarmBody }>(
    "/products/:productId/alarms/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM, "write")],
      schema: {
        tags: ["alarms"],
        summary: "Update an alarm",
        security: [{ bearerAuth: [] }],
        params: AlarmParamsSchema,
        body: UpdateAlarmBodySchema,
        response: {
          200: AlarmResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existingAlarm = await prisma.alarm.findUnique({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          select: { name: true, description: true, runbookId: true },
        });

        const alarm = await prisma.alarm.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            name: request.body.name,
            description: request.body.description,
            ...(request.body.runbookId !== undefined && {
              runbookId: request.body.runbookId || null,
            }),
          },
          include: { runbook: { select: { id: true, name: true } } },
        });

        request.auditEvents.push({
          action: SystemEventActions.ALARM_UPDATED,
          resource: SystemEventResources.ALARMS,
          resourceId: alarm.id,
          resourceLabel: alarm.name,
          metadata: {
            productId: request.params.productId,
            changes: buildDiff(
              { name: existingAlarm?.name, description: existingAlarm?.description, runbookId: existingAlarm?.runbookId },
              { name: alarm.name, description: alarm.description, runbookId: alarm.runbookId },
            ),
          },
        });

        reply.send({
          id: alarm.id,
          name: alarm.name,
          description: alarm.description,
          runbookId: alarm.runbookId,
          runbook: alarm.runbook,
          productId: alarm.productId,
          createdAt: alarm.createdAt.toISOString(),
          updatedAt: alarm.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update alarm";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Alarm");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Delete alarm
  app.delete<{ Params: AlarmParams }>(
    "/products/:productId/alarms/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM, "delete")],
      schema: {
        tags: ["alarms"],
        summary: "Delete an alarm",
        security: [{ bearerAuth: [] }],
        params: AlarmParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Fetch name before deletion for audit
        const alarmToDelete = await prisma.alarm.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true },
        });

        await prisma.alarm.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.ALARM_DELETED,
          resource: SystemEventResources.ALARMS,
          resourceId: request.params.id,
          resourceLabel: alarmToDelete?.name ?? null,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Alarm deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete alarm";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Alarm");
        }
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // DOWNSTREAMS
  // ============================================================================

  // List downstreams for a product
  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/downstreams",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.DOWNSTREAM, "read")],
      schema: {
        tags: ["downstreams"],
        summary: "Get all downstreams for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: DownstreamsResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const downstreams = await prisma.downstream.findMany({
          where: { productId: request.params.productId },
          orderBy: { name: "asc" },
        });

        reply.send(
          downstreams.map((d: Downstream) => ({
            id: d.id,
            name: d.name,
            description: d.description,
            productId: d.productId,
            createdAt: d.createdAt.toISOString(),
            updatedAt: d.updatedAt.toISOString(),
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch downstreams";
        HttpError.internal(reply, message);
      }
    }
  );

  // Create downstream
  app.post<{ Params: ProductIdParams; Body: CreateDownstreamBody }>(
    "/products/:productId/downstreams",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.DOWNSTREAM, "write")],
      schema: {
        tags: ["downstreams"],
        summary: "Create a new downstream",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateDownstreamBodySchema,
        response: {
          201: DownstreamResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const downstream = await prisma.downstream.create({
          data: {
            name: request.body.name,
            description: request.body.description,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.DOWNSTREAM_CREATED,
          resource: SystemEventResources.DOWNSTREAMS,
          resourceId: downstream.id,
          resourceLabel: downstream.name,
          metadata: { created: downstream },
        });

        reply.status(201).send({
          id: downstream.id,
          name: downstream.name,
          description: downstream.description,
          productId: downstream.productId,
          createdAt: downstream.createdAt.toISOString(),
          updatedAt: downstream.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create downstream";
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Update downstream
  app.put<{ Params: DownstreamParams; Body: UpdateDownstreamBody }>(
    "/products/:productId/downstreams/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.DOWNSTREAM, "write")],
      schema: {
        tags: ["downstreams"],
        summary: "Update a downstream",
        security: [{ bearerAuth: [] }],
        params: DownstreamParamsSchema,
        body: UpdateDownstreamBodySchema,
        response: {
          200: DownstreamResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existingDs = await prisma.downstream.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true, description: true },
        });

        const downstream = await prisma.downstream.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            name: request.body.name,
            description: request.body.description,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.DOWNSTREAM_UPDATED,
          resource: SystemEventResources.DOWNSTREAMS,
          resourceId: downstream.id,
          resourceLabel: downstream.name,
          metadata: {
            productId: request.params.productId,
            changes: buildDiff(
              { name: existingDs?.name, description: existingDs?.description },
              { name: downstream.name, description: downstream.description },
            ),
          },
        });

        reply.send({
          id: downstream.id,
          name: downstream.name,
          description: downstream.description,
          productId: downstream.productId,
          createdAt: downstream.createdAt.toISOString(),
          updatedAt: downstream.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update downstream";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Downstream");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Delete downstream
  app.delete<{ Params: DownstreamParams }>(
    "/products/:productId/downstreams/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.DOWNSTREAM, "delete")],
      schema: {
        tags: ["downstreams"],
        summary: "Delete a downstream",
        security: [{ bearerAuth: [] }],
        params: DownstreamParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const dsToDelete = await prisma.downstream.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          select: { name: true },
        });

        await prisma.downstream.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.DOWNSTREAM_DELETED,
          resource: SystemEventResources.DOWNSTREAMS,
          resourceId: request.params.id,
          resourceLabel: dsToDelete?.name ?? null,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Downstream deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete downstream";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Downstream");
        }
        HttpError.internal(reply, message);
      }
    }
  );

}
