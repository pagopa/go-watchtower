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

        const product = await prisma.product.update({
          where: { id: request.params.id },
          data: {
            name: request.body.name,
            description: request.body.description,
            isActive: request.body.isActive,
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

        await prisma.product.delete({
          where: { id: request.params.id },
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
            id: e.id,
            name: e.name,
            description: e.description,
            order: e.order,
            productId: e.productId,
            createdAt: e.createdAt.toISOString(),
            updatedAt: e.updatedAt.toISOString(),
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
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
        }

        const environment = await prisma.environment.create({
          data: {
            name: request.body.name,
            description: request.body.description,
            order: request.body.order ?? 0,
            productId: request.params.productId,
          },
        });

        reply.status(201).send({
          id: environment.id,
          name: environment.name,
          description: environment.description,
          order: environment.order,
          productId: environment.productId,
          createdAt: environment.createdAt.toISOString(),
          updatedAt: environment.updatedAt.toISOString(),
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

        const environment = await prisma.environment.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            name: request.body.name,
            description: request.body.description,
            order: request.body.order,
          },
        });

        reply.send({
          id: environment.id,
          name: environment.name,
          description: environment.description,
          order: environment.order,
          productId: environment.productId,
          createdAt: environment.createdAt.toISOString(),
          updatedAt: environment.updatedAt.toISOString(),
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

        await prisma.environment.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
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

        await prisma.microservice.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
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
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
        }

        const runbook = await prisma.runbook.create({
          data: {
            name: request.body.name,
            description: request.body.description,
            link: request.body.link,
            productId: request.params.productId,
          },
        });

        reply.status(201).send({
          id: runbook.id,
          name: runbook.name,
          description: runbook.description,
          link: runbook.link,
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

        const runbook = await prisma.runbook.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            name: request.body.name,
            description: request.body.description,
            link: request.body.link,
          },
        });

        reply.send({
          id: runbook.id,
          name: runbook.name,
          description: runbook.description,
          link: runbook.link,
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

        await prisma.runbook.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
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

        await prisma.finalAction.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
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

        await prisma.alarm.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
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

        await prisma.downstream.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
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

        await prisma.ignoredAlarm.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
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
