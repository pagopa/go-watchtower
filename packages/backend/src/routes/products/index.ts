import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  prisma,
  SystemComponent,
  type Product,
  type Environment,
  type Runbook,
  type FinalAction,
  type Alarm,
  type Downstream,
  type IgnoredAlarm,
} from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { buildDiff } from "../../services/system-event.service.js";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import { HttpError } from "../../utils/http-errors.js";
import { validateRegexPattern } from "../../utils/validate-regex.js";
import {
  CreateProductBodySchema,
  UpdateProductBodySchema,
  ProductParamsSchema,
  ProductResponseSchema,
  ProductsResponseSchema,
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
  CreateIgnoredAlarmBodySchema,
  UpdateIgnoredAlarmBodySchema,
  IgnoredAlarmParamsSchema,
  IgnoredAlarmResponseSchema,
  IgnoredAlarmsResponseSchema,
  FilterOptionsResponseSchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  type CreateProductBody,
  type UpdateProductBody,
  type ProductParams,
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
  type CreateIgnoredAlarmBody,
  type UpdateIgnoredAlarmBody,
  type IgnoredAlarmParams,
} from "./schemas.js";

export async function productRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  // List all products
  app.get(
    "/products",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRODUCT,"read")],
      schema: {
        tags: ["products"],
        summary: "Get all products",
        security: [{ bearerAuth: [] }],
        response: {
          200: ProductsResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        const products = await prisma.product.findMany({
          orderBy: { name: "asc" },
        });

        reply.send(
          products.map((p: Product) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            isActive: p.isActive,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch products";
        HttpError.internal(reply, message);
      }
    }
  );

  // Get product by ID
  app.get<{ Params: ProductParams }>(
    "/products/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRODUCT,"read")],
      schema: {
        tags: ["products"],
        summary: "Get product by ID",
        security: [{ bearerAuth: [] }],
        params: ProductParamsSchema,
        response: {
          200: ProductResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const product = await prisma.product.findUnique({
          where: { id: request.params.id },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        reply.send({
          id: product.id,
          name: product.name,
          description: product.description,
          isActive: product.isActive,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch product";
        HttpError.internal(reply, message);
      }
    }
  );

  // Create product
  app.post<{ Body: CreateProductBody }>(
    "/products",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRODUCT,"write")],
      schema: {
        tags: ["products"],
        summary: "Create a new product",
        security: [{ bearerAuth: [] }],
        body: CreateProductBodySchema,
        response: {
          201: ProductResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const product = await prisma.product.create({
          data: {
            name: request.body.name,
            description: request.body.description,
            isActive: request.body.isActive ?? true,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.PRODUCT_CREATED,
          resource: SystemEventResources.PRODUCTS,
          resourceId: product.id,
          resourceLabel: product.name,
          metadata: { created: product },
        });

        reply.status(201).send({
          id: product.id,
          name: product.name,
          description: product.description,
          isActive: product.isActive,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create product";
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Update product
  app.put<{ Params: ProductParams; Body: UpdateProductBody }>(
    "/products/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRODUCT,"write")],
      schema: {
        tags: ["products"],
        summary: "Update a product",
        security: [{ bearerAuth: [] }],
        params: ProductParamsSchema,
        body: UpdateProductBodySchema,
        response: {
          200: ProductResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existing = await prisma.product.findUnique({
          where: { id: request.params.id },
          select: { name: true, description: true, isActive: true },
        });

        const product = await prisma.product.update({
          where: { id: request.params.id },
          data: {
            name: request.body.name,
            description: request.body.description,
            isActive: request.body.isActive,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.PRODUCT_UPDATED,
          resource: SystemEventResources.PRODUCTS,
          resourceId: product.id,
          resourceLabel: product.name,
          metadata: {
            changes: buildDiff(
              { name: existing?.name, description: existing?.description, isActive: existing?.isActive },
              { name: product.name, description: product.description, isActive: product.isActive },
            ),
          },
        });

        reply.send({
          id: product.id,
          name: product.name,
          description: product.description,
          isActive: product.isActive,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update product";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Product");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Delete product
  app.delete<{ Params: ProductParams }>(
    "/products/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRODUCT,"delete")],
      schema: {
        tags: ["products"],
        summary: "Delete a product",
        security: [{ bearerAuth: [] }],
        params: ProductParamsSchema,
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
        const productToDelete = await prisma.product.findUnique({
          where: { id: request.params.id },
          select: { name: true },
        });

        await prisma.product.delete({
          where: { id: request.params.id },
        });

        request.auditEvents.push({
          action: SystemEventActions.PRODUCT_DELETED,
          resource: SystemEventResources.PRODUCTS,
          resourceId: request.params.id,
          resourceLabel: productToDelete?.name ?? null,
        });

        reply.send({ message: "Product deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete product";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Product");
        }
        HttpError.internal(reply, message);
      }
    }
  );

  // ============================================================================
  // FILTER OPTIONS (aggregate endpoint for analyses page)
  // ============================================================================

  // Get all filter options for a product in a single request
  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/filter-options",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_ANALYSIS,"read")],
      schema: {
        tags: ["analyses"],
        summary: "Get all filter options for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: FilterOptionsResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId } = request.params;

        const product = await prisma.product.findUnique({
          where: { id: productId },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const [environments, alarms, finalActions, resources, downstreams, runbooks] =
          await Promise.all([
            prisma.environment.findMany({
              where: { productId },
              orderBy: [{ order: "asc" }, { name: "asc" }],
            }),
            prisma.alarm.findMany({
              where: { productId },
              include: { runbook: { select: { id: true, name: true } } },
              orderBy: { name: "asc" },
            }),
            prisma.finalAction.findMany({
              where: { productId },
              orderBy: [{ order: "asc" }, { name: "asc" }],
            }),
            prisma.resource.findMany({
              where: { productId },
              include: { type: { select: { id: true, name: true } } },
              orderBy: { name: "asc" },
            }),
            prisma.downstream.findMany({
              where: { productId },
              orderBy: { name: "asc" },
            }),
            prisma.runbook.findMany({
              where: { productId },
              orderBy: { name: "asc" },
            }),
          ]);

        reply.send({
          environments: environments.map((e: Environment) => ({
            id:                  e.id,
            name:                e.name,
            description:         e.description,
            order:               e.order,
            productId:           e.productId,
            slackChannelId:      e.slackChannelId ?? null,
            defaultAwsAccountId: e.defaultAwsAccountId ?? null,
            defaultAwsRegion:    e.defaultAwsRegion ?? null,
            onCallAlarmPattern:  e.onCallAlarmPattern ?? null,
            createdAt:           e.createdAt.toISOString(),
            updatedAt:           e.updatedAt.toISOString(),
          })),
          alarms: alarms.map((a: Alarm & { runbook: { id: string; name: string } | null }) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            runbookId: a.runbookId,
            runbook: a.runbook,
            productId: a.productId,
            createdAt: a.createdAt.toISOString(),
            updatedAt: a.updatedAt.toISOString(),
          })),
          finalActions: finalActions.map((fa: FinalAction) => ({
            id: fa.id,
            name: fa.name,
            description: fa.description,
            order: fa.order,
            isOther: fa.isOther,
            productId: fa.productId,
            createdAt: fa.createdAt.toISOString(),
            updatedAt: fa.updatedAt.toISOString(),
          })),
          resources: resources.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            typeId: r.typeId,
            type: r.type,
            productId: r.productId,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
          downstreams: downstreams.map((d: Downstream) => ({
            id: d.id,
            name: d.name,
            description: d.description,
            productId: d.productId,
            createdAt: d.createdAt.toISOString(),
            updatedAt: d.updatedAt.toISOString(),
          })),
          runbooks: runbooks.map((r: Runbook) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            link: r.link,
            status: r.status,
            productId: r.productId,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch filter options";
        HttpError.internal(reply, message);
      }
    }
  );

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

        const environment = await prisma.environment.create({
          data: {
            name:                request.body.name,
            description:         request.body.description,
            order:               request.body.order ?? 0,
            productId:           request.params.productId,
            slackChannelId:      request.body.slackChannelId,
            defaultAwsAccountId: request.body.defaultAwsAccountId,
            defaultAwsRegion:    request.body.defaultAwsRegion,
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
          select: { name: true, description: true, order: true, slackChannelId: true, defaultAwsAccountId: true, defaultAwsRegion: true, onCallAlarmPattern: true },
        });

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

  // ============================================================================
  // IGNORED ALARMS
  // ============================================================================

  const formatIgnoredAlarm = (ia: IgnoredAlarm & { alarm: { id: string; name: string }; environment: { id: string; name: string } }) => ({
    id: ia.id,
    alarmId: ia.alarmId,
    environmentId: ia.environmentId,
    reason: ia.reason,
    isActive: ia.isActive,
    productId: ia.productId,
    validity: ia.validity as unknown[],
    exclusions: ia.exclusions as unknown[],
    alarm: ia.alarm,
    environment: ia.environment,
    createdAt: ia.createdAt.toISOString(),
    updatedAt: ia.updatedAt.toISOString(),
  });

  // List ignored alarms for a product
  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/ignored-alarms",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.IGNORED_ALARM, "read")],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Get all ignored alarms for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: IgnoredAlarmsResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const ignoredAlarms = await prisma.ignoredAlarm.findMany({
          where: { productId: request.params.productId },
          include: {
            alarm: { select: { id: true, name: true } },
            environment: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        reply.send(ignoredAlarms.map(formatIgnoredAlarm));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch ignored alarms";
        HttpError.internal(reply, message);
      }
    }
  );

  // Get ignored alarm by ID
  app.get<{ Params: IgnoredAlarmParams }>(
    "/products/:productId/ignored-alarms/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.IGNORED_ALARM, "read")],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Get an ignored alarm by ID",
        security: [{ bearerAuth: [] }],
        params: IgnoredAlarmParamsSchema,
        response: {
          200: IgnoredAlarmResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const ignoredAlarm = await prisma.ignoredAlarm.findFirst({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          include: {
            alarm: { select: { id: true, name: true } },
            environment: { select: { id: true, name: true } },
          },
        });

        if (!ignoredAlarm) {
          return HttpError.notFound(reply, "Ignored alarm");
        }

        reply.send(formatIgnoredAlarm(ignoredAlarm));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch ignored alarm";
        HttpError.internal(reply, message);
      }
    }
  );

  // Create ignored alarm
  app.post<{ Params: ProductIdParams; Body: CreateIgnoredAlarmBody }>(
    "/products/:productId/ignored-alarms",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.IGNORED_ALARM, "write")],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Create a new ignored alarm",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateIgnoredAlarmBodySchema,
        response: {
          201: IgnoredAlarmResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const ignoredAlarm = await prisma.ignoredAlarm.create({
          data: {
            alarmId: request.body.alarmId,
            environmentId: request.body.environmentId,
            reason: request.body.reason || null,
            isActive: request.body.isActive ?? true,
            productId: request.params.productId,
            validity: request.body.validity ?? [],
            exclusions: request.body.exclusions ?? [],
          },
          include: {
            alarm: { select: { id: true, name: true } },
            environment: { select: { id: true, name: true } },
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.IGNORED_ALARM_CREATED,
          resource: SystemEventResources.IGNORED_ALARMS,
          resourceId: ignoredAlarm.id,
          resourceLabel: ignoredAlarm.alarm?.name ?? null,
          metadata: { created: ignoredAlarm },
        });

        reply.status(201).send(formatIgnoredAlarm(ignoredAlarm));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create ignored alarm";
        if (message.includes("Unique constraint")) {
          return HttpError.badRequest(reply, "This alarm is already ignored for this environment");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Update ignored alarm
  app.put<{ Params: IgnoredAlarmParams; Body: UpdateIgnoredAlarmBody }>(
    "/products/:productId/ignored-alarms/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.IGNORED_ALARM, "write")],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Update an ignored alarm",
        security: [{ bearerAuth: [] }],
        params: IgnoredAlarmParamsSchema,
        body: UpdateIgnoredAlarmBodySchema,
        response: {
          200: IgnoredAlarmResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existingIgnoredAlarm = await prisma.ignoredAlarm.findUnique({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          select: { alarmId: true, environmentId: true, reason: true, isActive: true, validity: true, exclusions: true },
        });

        const ignoredAlarm = await prisma.ignoredAlarm.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            ...(request.body.alarmId !== undefined && { alarmId: request.body.alarmId }),
            ...(request.body.environmentId !== undefined && { environmentId: request.body.environmentId }),
            ...(request.body.reason !== undefined && { reason: request.body.reason }),
            ...(request.body.isActive !== undefined && { isActive: request.body.isActive }),
            ...(request.body.validity !== undefined && { validity: request.body.validity }),
            ...(request.body.exclusions !== undefined && { exclusions: request.body.exclusions }),
          },
          include: {
            alarm: { select: { id: true, name: true } },
            environment: { select: { id: true, name: true } },
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.IGNORED_ALARM_UPDATED,
          resource: SystemEventResources.IGNORED_ALARMS,
          resourceId: ignoredAlarm.id,
          resourceLabel: ignoredAlarm.alarm?.name ?? null,
          metadata: {
            productId: request.params.productId,
            changes: buildDiff(
              {
                alarmId: existingIgnoredAlarm?.alarmId,
                environmentId: existingIgnoredAlarm?.environmentId,
                reason: existingIgnoredAlarm?.reason,
                isActive: existingIgnoredAlarm?.isActive,
                validity: existingIgnoredAlarm?.validity,
                exclusions: existingIgnoredAlarm?.exclusions,
              },
              {
                alarmId: ignoredAlarm.alarmId,
                environmentId: ignoredAlarm.environmentId,
                reason: ignoredAlarm.reason,
                isActive: ignoredAlarm.isActive,
                validity: ignoredAlarm.validity,
                exclusions: ignoredAlarm.exclusions,
              },
            ),
          },
        });

        reply.send(formatIgnoredAlarm(ignoredAlarm));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update ignored alarm";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Ignored alarm");
        }
        if (message.includes("Unique constraint")) {
          return HttpError.badRequest(reply, "This alarm is already ignored for this environment");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Delete ignored alarm
  app.delete<{ Params: IgnoredAlarmParams }>(
    "/products/:productId/ignored-alarms/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.IGNORED_ALARM, "delete")],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Delete an ignored alarm",
        security: [{ bearerAuth: [] }],
        params: IgnoredAlarmParamsSchema,
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
        const ignoredAlarmToDelete = await prisma.ignoredAlarm.findFirst({
          where: { id: request.params.id, productId: request.params.productId },
          include: { alarm: { select: { name: true } } },
        });

        await prisma.ignoredAlarm.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.IGNORED_ALARM_DELETED,
          resource: SystemEventResources.IGNORED_ALARMS,
          resourceId: request.params.id,
          resourceLabel: ignoredAlarmToDelete?.alarm?.name ?? null,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Ignored alarm deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete ignored alarm";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Ignored alarm");
        }
        HttpError.internal(reply, message);
      }
    }
  );
}
