import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  prisma,
  Resource,
  type Product,
  type Environment,
  type Microservice,
  type Runbook,
  type FinalAction,
  type Alarm,
  type Downstream,
  type IgnoredAlarm,
} from "@go-watchtower/database";
import { hasPermission } from "../../services/permission.service.js";
import { buildDiff } from "../../services/system-event.service.js";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
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
  CreateMicroserviceBodySchema,
  UpdateMicroserviceBodySchema,
  MicroserviceParamsSchema,
  MicroserviceResponseSchema,
  MicroservicesResponseSchema,
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
  type CreateMicroserviceBody,
  type UpdateMicroserviceBody,
  type MicroserviceParams,
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
      onRequest: [app.authenticate],
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
    async (request, reply) => {
      try {
        const canRead = await hasPermission(request.user.userId, Resource.PRODUCT, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

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
        reply.status(500).send({ error: message });
      }
    }
  );

  // Get product by ID
  app.get<{ Params: ProductParams }>(
    "/products/:id",
    {
      onRequest: [app.authenticate],
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
        const canRead = await hasPermission(request.user.userId, Resource.PRODUCT, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const product = await prisma.product.findUnique({
          where: { id: request.params.id },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create product
  app.post<{ Body: CreateProductBody }>(
    "/products",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.PRODUCT, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

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
        reply.status(400).send({ error: message });
      }
    }
  );

  // Update product
  app.put<{ Params: ProductParams; Body: UpdateProductBody }>(
    "/products/:id",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.PRODUCT, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

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
          return reply.status(404).send({ error: "Product not found" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Delete product
  app.delete<{ Params: ProductParams }>(
    "/products/:id",
    {
      onRequest: [app.authenticate],
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
        const canDelete = await hasPermission(request.user.userId, Resource.PRODUCT, "delete");
        if (!canDelete) {
          return reply.status(403).send({ error: "Permission denied" });
        }

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
          return reply.status(404).send({ error: "Product not found" });
        }
        reply.status(500).send({ error: message });
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
      onRequest: [app.authenticate],
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
        const canRead = await hasPermission(request.user.userId, Resource.ALARM_ANALYSIS, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const { productId } = request.params;

        const product = await prisma.product.findUnique({
          where: { id: productId },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
        }

        const [environments, alarms, finalActions, microservices, downstreams, runbooks] =
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
            prisma.microservice.findMany({
              where: { productId },
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
          microservices: microservices.map((m: Microservice) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            productId: m.productId,
            createdAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
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
        reply.status(500).send({ error: message });
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
      onRequest: [app.authenticate],
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
        const canRead = await hasPermission(request.user.userId, Resource.ENVIRONMENT, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create environment
  app.post<{ Params: ProductIdParams; Body: CreateEnvironmentBody }>(
    "/products/:productId/environments",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.ENVIRONMENT, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(400).send({ error: message });
      }
    }
  );

  // Update environment
  app.put<{ Params: EnvironmentParams; Body: UpdateEnvironmentBody }>(
    "/products/:productId/environments/:id",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.ENVIRONMENT, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const existingEnv = await prisma.environment.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Environment not found" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Delete environment
  app.delete<{ Params: EnvironmentParams }>(
    "/products/:productId/environments/:id",
    {
      onRequest: [app.authenticate],
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
        const canDelete = await hasPermission(request.user.userId, Resource.ENVIRONMENT, "delete");
        if (!canDelete) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const envToDelete = await prisma.environment.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Environment not found" });
        }
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // MICROSERVICES
  // ============================================================================

  // List microservices for a product
  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/microservices",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["microservices"],
        summary: "Get all microservices for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: MicroservicesResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(request.user.userId, Resource.MICROSERVICE, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
        }

        const microservices = await prisma.microservice.findMany({
          where: { productId: request.params.productId },
          orderBy: { name: "asc" },
        });

        reply.send(
          microservices.map((m: Microservice) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            productId: m.productId,
            createdAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch microservices";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create microservice
  app.post<{ Params: ProductIdParams; Body: CreateMicroserviceBody }>(
    "/products/:productId/microservices",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["microservices"],
        summary: "Create a new microservice",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateMicroserviceBodySchema,
        response: {
          201: MicroserviceResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canWrite = await hasPermission(request.user.userId, Resource.MICROSERVICE, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
        }

        const microservice = await prisma.microservice.create({
          data: {
            name: request.body.name,
            description: request.body.description,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.MICROSERVICE_CREATED,
          resource: SystemEventResources.MICROSERVICES,
          resourceId: microservice.id,
          resourceLabel: microservice.name,
          metadata: { created: microservice },
        });

        reply.status(201).send({
          id: microservice.id,
          name: microservice.name,
          description: microservice.description,
          productId: microservice.productId,
          createdAt: microservice.createdAt.toISOString(),
          updatedAt: microservice.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create microservice";
        reply.status(400).send({ error: message });
      }
    }
  );

  // Update microservice
  app.put<{ Params: MicroserviceParams; Body: UpdateMicroserviceBody }>(
    "/products/:productId/microservices/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["microservices"],
        summary: "Update a microservice",
        security: [{ bearerAuth: [] }],
        params: MicroserviceParamsSchema,
        body: UpdateMicroserviceBodySchema,
        response: {
          200: MicroserviceResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canWrite = await hasPermission(request.user.userId, Resource.MICROSERVICE, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const existingMs = await prisma.microservice.findUnique({
          where: { id: request.params.id },
          select: { name: true, description: true },
        });

        const microservice = await prisma.microservice.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            ...(request.body.name !== undefined && { name: request.body.name }),
            ...(request.body.description !== undefined && { description: request.body.description }),
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.MICROSERVICE_UPDATED,
          resource: SystemEventResources.MICROSERVICES,
          resourceId: microservice.id,
          resourceLabel: microservice.name,
          metadata: {
            productId: request.params.productId,
            changes: buildDiff(
              { name: existingMs?.name, description: existingMs?.description },
              { name: microservice.name, description: microservice.description },
            ),
          },
        });

        reply.send({
          id: microservice.id,
          name: microservice.name,
          description: microservice.description,
          productId: microservice.productId,
          createdAt: microservice.createdAt.toISOString(),
          updatedAt: microservice.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update microservice";
        if (message.includes("Record to update not found")) {
          return reply.status(404).send({ error: "Microservice not found" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Delete microservice
  app.delete<{ Params: MicroserviceParams }>(
    "/products/:productId/microservices/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["microservices"],
        summary: "Delete a microservice",
        security: [{ bearerAuth: [] }],
        params: MicroserviceParamsSchema,
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
        const canDelete = await hasPermission(request.user.userId, Resource.MICROSERVICE, "delete");
        if (!canDelete) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const msToDelete = await prisma.microservice.findUnique({
          where: { id: request.params.id },
          select: { name: true },
        });

        await prisma.microservice.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.MICROSERVICE_DELETED,
          resource: SystemEventResources.MICROSERVICES,
          resourceId: request.params.id,
          resourceLabel: msToDelete?.name ?? null,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Microservice deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete microservice";
        if (message.includes("Record to delete does not exist")) {
          return reply.status(404).send({ error: "Microservice not found" });
        }
        reply.status(500).send({ error: message });
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
      onRequest: [app.authenticate],
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
        const canRead = await hasPermission(request.user.userId, Resource.RUNBOOK, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create runbook
  app.post<{ Params: ProductIdParams; Body: CreateRunbookBody }>(
    "/products/:productId/runbooks",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.RUNBOOK, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(400).send({ error: message });
      }
    }
  );

  // Update runbook
  app.put<{ Params: RunbookParams; Body: UpdateRunbookBody }>(
    "/products/:productId/runbooks/:id",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.RUNBOOK, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const existingRunbook = await prisma.runbook.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Runbook not found" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Delete runbook
  app.delete<{ Params: RunbookParams }>(
    "/products/:productId/runbooks/:id",
    {
      onRequest: [app.authenticate],
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
        const canDelete = await hasPermission(request.user.userId, Resource.RUNBOOK, "delete");
        if (!canDelete) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const runbookToDelete = await prisma.runbook.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Runbook not found" });
        }
        reply.status(500).send({ error: message });
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
      onRequest: [app.authenticate],
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
        const canRead = await hasPermission(request.user.userId, Resource.FINAL_ACTION, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create final action
  app.post<{ Params: ProductIdParams; Body: CreateFinalActionBody }>(
    "/products/:productId/final-actions",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.FINAL_ACTION, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(400).send({ error: message });
      }
    }
  );

  // Update final action
  app.put<{ Params: FinalActionParams; Body: UpdateFinalActionBody }>(
    "/products/:productId/final-actions/:id",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.FINAL_ACTION, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const existingFa = await prisma.finalAction.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Final action not found" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Delete final action
  app.delete<{ Params: FinalActionParams }>(
    "/products/:productId/final-actions/:id",
    {
      onRequest: [app.authenticate],
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
        const canDelete = await hasPermission(request.user.userId, Resource.FINAL_ACTION, "delete");
        if (!canDelete) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const faToDelete = await prisma.finalAction.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Final action not found" });
        }
        reply.status(500).send({ error: message });
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
      onRequest: [app.authenticate],
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
        const canRead = await hasPermission(request.user.userId, Resource.ALARM, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create alarm
  app.post<{ Params: ProductIdParams; Body: CreateAlarmBody }>(
    "/products/:productId/alarms",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.ALARM, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(400).send({ error: message });
      }
    }
  );

  // Update alarm
  app.put<{ Params: AlarmParams; Body: UpdateAlarmBody }>(
    "/products/:productId/alarms/:id",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.ALARM, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

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
          return reply.status(404).send({ error: "Alarm not found" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Delete alarm
  app.delete<{ Params: AlarmParams }>(
    "/products/:productId/alarms/:id",
    {
      onRequest: [app.authenticate],
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
        const canDelete = await hasPermission(request.user.userId, Resource.ALARM, "delete");
        if (!canDelete) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Fetch name before deletion for audit
        const alarmToDelete = await prisma.alarm.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Alarm not found" });
        }
        reply.status(500).send({ error: message });
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
      onRequest: [app.authenticate],
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
        const canRead = await hasPermission(request.user.userId, Resource.DOWNSTREAM, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create downstream
  app.post<{ Params: ProductIdParams; Body: CreateDownstreamBody }>(
    "/products/:productId/downstreams",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.DOWNSTREAM, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(400).send({ error: message });
      }
    }
  );

  // Update downstream
  app.put<{ Params: DownstreamParams; Body: UpdateDownstreamBody }>(
    "/products/:productId/downstreams/:id",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.DOWNSTREAM, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const existingDs = await prisma.downstream.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Downstream not found" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Delete downstream
  app.delete<{ Params: DownstreamParams }>(
    "/products/:productId/downstreams/:id",
    {
      onRequest: [app.authenticate],
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
        const canDelete = await hasPermission(request.user.userId, Resource.DOWNSTREAM, "delete");
        if (!canDelete) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const dsToDelete = await prisma.downstream.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Downstream not found" });
        }
        reply.status(500).send({ error: message });
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
      onRequest: [app.authenticate],
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
        const canRead = await hasPermission(request.user.userId, Resource.IGNORED_ALARM, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
        reply.status(500).send({ error: message });
      }
    }
  );

  // Get ignored alarm by ID
  app.get<{ Params: IgnoredAlarmParams }>(
    "/products/:productId/ignored-alarms/:id",
    {
      onRequest: [app.authenticate],
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
        const canRead = await hasPermission(request.user.userId, Resource.IGNORED_ALARM, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

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
          return reply.status(404).send({ error: "Ignored alarm not found" });
        }

        reply.send(formatIgnoredAlarm(ignoredAlarm));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch ignored alarm";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create ignored alarm
  app.post<{ Params: ProductIdParams; Body: CreateIgnoredAlarmBody }>(
    "/products/:productId/ignored-alarms",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.IGNORED_ALARM, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
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
          return reply.status(400).send({ error: "This alarm is already ignored for this environment" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Update ignored alarm
  app.put<{ Params: IgnoredAlarmParams; Body: UpdateIgnoredAlarmBody }>(
    "/products/:productId/ignored-alarms/:id",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(request.user.userId, Resource.IGNORED_ALARM, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

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
          return reply.status(404).send({ error: "Ignored alarm not found" });
        }
        if (message.includes("Unique constraint")) {
          return reply.status(400).send({ error: "This alarm is already ignored for this environment" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Delete ignored alarm
  app.delete<{ Params: IgnoredAlarmParams }>(
    "/products/:productId/ignored-alarms/:id",
    {
      onRequest: [app.authenticate],
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
        const canDelete = await hasPermission(request.user.userId, Resource.IGNORED_ALARM, "delete");
        if (!canDelete) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Fetch name before deletion for audit
        const ignoredAlarmToDelete = await prisma.ignoredAlarm.findUnique({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Ignored alarm not found" });
        }
        reply.status(500).send({ error: message });
      }
    }
  );
}
