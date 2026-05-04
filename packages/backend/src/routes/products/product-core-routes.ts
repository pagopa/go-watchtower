import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  prisma,
  SystemComponent,
  type Product,
} from "@go-watchtower/database";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { buildDiff } from "../../services/system-event.service.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  CreateProductBodySchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  ProductParamsSchema,
  ProductResponseSchema,
  ProductsResponseSchema,
  UpdateProductBodySchema,
  type CreateProductBody,
  type ProductParams,
  type UpdateProductBody,
} from "./schemas.js";

export async function registerProductCoreRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    "/products",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.PRODUCT, "read"),
      ],
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
          products.map((product: Product) => ({
            id: product.id,
            name: product.name,
            description: product.description,
            isActive: product.isActive,
            createdAt: product.createdAt.toISOString(),
            updatedAt: product.updatedAt.toISOString(),
          })),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch products";
        HttpError.internal(reply, message);
      }
    },
  );

  app.get<{ Params: ProductParams }>(
    "/products/:id",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.PRODUCT, "read"),
      ],
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
        const message =
          error instanceof Error ? error.message : "Failed to fetch product";
        HttpError.internal(reply, message);
      }
    },
  );

  app.post<{ Body: CreateProductBody }>(
    "/products",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.PRODUCT, "write"),
      ],
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
        const message =
          error instanceof Error ? error.message : "Failed to create product";
        HttpError.badRequest(reply, message);
      }
    },
  );

  app.put<{ Params: ProductParams; Body: UpdateProductBody }>(
    "/products/:id",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.PRODUCT, "write"),
      ],
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
              {
                name: existing?.name,
                description: existing?.description,
                isActive: existing?.isActive,
              },
              {
                name: product.name,
                description: product.description,
                isActive: product.isActive,
              },
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
        const message =
          error instanceof Error ? error.message : "Failed to update product";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Product");
        }
        HttpError.badRequest(reply, message);
      }
    },
  );

  app.delete<{ Params: ProductParams }>(
    "/products/:id",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.PRODUCT, "delete"),
      ],
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
        const message =
          error instanceof Error ? error.message : "Failed to delete product";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Product");
        }
        HttpError.internal(reply, message);
      }
    },
  );
}
