import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  prisma,
  Resource,
  PermissionScope,
  AuthProvider,
  type User,
  type Role,
  type RolePermission,
  type UserPermissionOverride,
} from "@go-watchtower/database";
import {
  hasPermission,
  getUserPermissions,
  getUserPermissionOverrides,
  setUserPermissionOverride,
  removeUserPermissionOverride,
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  updateRolePermissions,
} from "../../services/permission.service.js";
import { hashPassword } from "../../utils/password.js";
import {
  UserResponseSchema,
  UserDetailResponseSchema,
  UsersResponseSchema,
  UserPermissionsResponseSchema,
  UserPreferencesResponseSchema,
  UserPreferencesSchema,
  CreateUserBodySchema,
  UpdateUserBodySchema,
  SetPermissionOverrideBodySchema,
  UserIdParamsSchema,
  UserPermissionResourceParamsSchema,
  RolesResponseSchema,
  RoleResponseSchema,
  RoleIdParamsSchema,
  CreateRoleBodySchema,
  UpdateRoleBodySchema,
  UpdateRolePermissionsBodySchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  type CreateUserBody,
  type UpdateUserBody,
  type SetPermissionOverrideBody,
  type UserPreferencesBody,
  type UserIdParams,
  type UserPermissionResourceParams,
  type RoleIdParams,
  type CreateRoleBody,
  type UpdateRoleBody,
  type UpdateRolePermissionsBody,
} from "./schemas.js";

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // ============================================================================
  // USERS
  // ============================================================================

  // List all users
  app.get(
    "/users",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Get all users",
        security: [{ bearerAuth: [] }],
        response: {
          200: UsersResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(request.user.userId, Resource.USER, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const users = await prisma.user.findMany({
          include: { role: true },
          orderBy: { name: "asc" },
        });

        reply.send(
          users.map((u: User & { role: Role }) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            roleName: u.role.name,
            provider: u.provider,
            isActive: u.isActive,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch users";
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // USER PREFERENCES
  // ============================================================================

  // Get my preferences
  app.get(
    "/users/me/preferences",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Get current user preferences",
        security: [{ bearerAuth: [] }],
        response: {
          200: UserPreferencesResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: request.user.userId },
          select: { preferences: true },
        });

        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        reply.send(user.preferences as Record<string, unknown>);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch preferences";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Update my preferences (deep merge)
  app.patch<{ Body: UserPreferencesBody }>(
    "/users/me/preferences",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Update current user preferences (deep merge)",
        security: [{ bearerAuth: [] }],
        body: UserPreferencesSchema,
        response: {
          200: UserPreferencesResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: request.user.userId },
          select: { preferences: true },
        });

        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        const current = (user.preferences ?? {}) as Record<string, unknown>;
        const incoming = request.body as Record<string, unknown>;

        // Deep merge: top-level keys are merged, nested objects are merged one level deep
        const merged: Record<string, unknown> = { ...current };
        for (const [key, value] of Object.entries(incoming)) {
          if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            typeof current[key] === "object" &&
            current[key] !== null &&
            !Array.isArray(current[key])
          ) {
            merged[key] = { ...(current[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
          } else {
            merged[key] = value;
          }
        }

        const updated = await prisma.user.update({
          where: { id: request.user.userId },
          data: { preferences: merged as object },
          select: { preferences: true },
        });

        reply.send(updated.preferences as Record<string, unknown>);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update preferences";
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // USER DETAIL
  // ============================================================================

  // Get user by ID (with permission overrides)
  app.get<{ Params: UserIdParams }>(
    "/users/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Get user by ID with permission overrides",
        security: [{ bearerAuth: [] }],
        params: UserIdParamsSchema,
        response: {
          200: UserDetailResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(request.user.userId, Resource.USER, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const user = await prisma.user.findUnique({
          where: { id: request.params.id },
          include: {
            role: true,
            permissionOverrides: {
              include: {
                grantedByUser: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        });

        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        reply.send({
          id: user.id,
          email: user.email,
          name: user.name,
          roleName: user.role.name,
          provider: user.provider,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          permissionOverrides: user.permissionOverrides.map((o: UserPermissionOverride & { grantedByUser: { id: string; name: string; email: string } | null }) => ({
            resource: o.resource,
            canRead: o.canRead,
            canWrite: o.canWrite,
            canDelete: o.canDelete,
            reason: o.reason,
            grantedByUser: o.grantedByUser,
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch user";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create user
  app.post<{ Body: CreateUserBody }>(
    "/users",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Create a new user",
        security: [{ bearerAuth: [] }],
        body: CreateUserBodySchema,
        response: {
          201: UserResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canWrite = await hasPermission(request.user.userId, Resource.USER, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const existingUser = await prisma.user.findUnique({
          where: { email: request.body.email },
        });

        if (existingUser) {
          return reply.status(400).send({ error: "User with this email already exists" });
        }

        // If no roleId, use default role
        let roleId = request.body.roleId;
        if (!roleId) {
          const defaultRole = await prisma.role.findFirst({
            where: { isDefault: true },
          });
          if (!defaultRole) {
            return reply.status(500).send({ error: "Default role not configured" });
          }
          roleId = defaultRole.id;
        }

        const passwordHash = await hashPassword(request.body.password);

        const user = await prisma.user.create({
          data: {
            email: request.body.email,
            name: request.body.name,
            passwordHash,
            roleId,
            provider: AuthProvider.LOCAL,
          },
          include: { role: true },
        });

        reply.status(201).send({
          id: user.id,
          email: user.email,
          name: user.name,
          roleName: user.role.name,
          provider: user.provider,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create user";
        reply.status(400).send({ error: message });
      }
    }
  );

  // Update user
  app.put<{ Params: UserIdParams; Body: UpdateUserBody }>(
    "/users/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Update a user",
        security: [{ bearerAuth: [] }],
        params: UserIdParamsSchema,
        body: UpdateUserBodySchema,
        response: {
          200: UserResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canWrite = await hasPermission(request.user.userId, Resource.USER, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const user = await prisma.user.update({
          where: { id: request.params.id },
          data: {
            name: request.body.name,
            email: request.body.email,
            isActive: request.body.isActive,
            roleId: request.body.roleId,
          },
          include: { role: true },
        });

        reply.send({
          id: user.id,
          email: user.email,
          name: user.name,
          roleName: user.role.name,
          provider: user.provider,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update user";
        if (message.includes("Record to update not found")) {
          return reply.status(404).send({ error: "User not found" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // Delete user
  app.delete<{ Params: UserIdParams }>(
    "/users/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Delete a user",
        security: [{ bearerAuth: [] }],
        params: UserIdParamsSchema,
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
        const canDelete = await hasPermission(request.user.userId, Resource.USER, "delete");
        if (!canDelete) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Prevent self-deletion
        if (request.params.id === request.user.userId) {
          return reply.status(400).send({ error: "Cannot delete your own account" });
        }

        await prisma.user.delete({
          where: { id: request.params.id },
        });

        reply.send({ message: "User deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete user";
        if (message.includes("Record to delete does not exist")) {
          return reply.status(404).send({ error: "User not found" });
        }
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // USER PERMISSIONS
  // ============================================================================

  // Get user permissions (effective + role + overrides)
  app.get<{ Params: UserIdParams }>(
    "/users/:id/permissions",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Get user effective permissions, role permissions, and overrides",
        security: [{ bearerAuth: [] }],
        params: UserIdParamsSchema,
        response: {
          200: UserPermissionsResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(request.user.userId, Resource.USER, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const user = await prisma.user.findUnique({
          where: { id: request.params.id },
          include: {
            role: {
              include: { permissions: true },
            },
          },
        });

        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        const permissions = await getUserPermissions(request.params.id);
        const overrides = await getUserPermissionOverrides(request.params.id);

        reply.send({
          permissions,
          rolePermissions: user.role.permissions.map((p: RolePermission) => ({
            resource: p.resource,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
          })),
          overrides: overrides.map((o: UserPermissionOverride & { grantedByUser: { id: string; name: string; email: string } | null }) => ({
            resource: o.resource,
            canRead: o.canRead,
            canWrite: o.canWrite,
            canDelete: o.canDelete,
            reason: o.reason,
            grantedByUser: o.grantedByUser,
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch permissions";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Set permission override
  app.put<{ Params: UserIdParams; Body: SetPermissionOverrideBody }>(
    "/users/:id/permissions",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Set a permission override for a user",
        security: [{ bearerAuth: [] }],
        params: UserIdParamsSchema,
        body: SetPermissionOverrideBodySchema,
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
        const canWrite = await hasPermission(request.user.userId, Resource.USER, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const user = await prisma.user.findUnique({
          where: { id: request.params.id },
        });

        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        await setUserPermissionOverride(
          request.params.id,
          request.body.resource as Resource,
          {
            canRead: request.body.canRead,
            canWrite: request.body.canWrite,
            canDelete: request.body.canDelete,
          },
          request.user.userId,
          request.body.reason
        );

        reply.send({ message: "Permission override set successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to set permission override";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Remove permission override
  app.delete<{ Params: UserPermissionResourceParams }>(
    "/users/:id/permissions/:resource",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        summary: "Remove a permission override for a user",
        security: [{ bearerAuth: [] }],
        params: UserPermissionResourceParamsSchema,
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
        const canWrite = await hasPermission(request.user.userId, Resource.USER, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const user = await prisma.user.findUnique({
          where: { id: request.params.id },
        });

        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        const removed = await removeUserPermissionOverride(
          request.params.id,
          request.params.resource as Resource
        );

        if (!removed) {
          return reply.status(404).send({ error: "Permission override not found" });
        }

        reply.send({ message: "Permission override removed successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to remove permission override";
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // ROLES
  // ============================================================================

  // List all roles
  app.get(
    "/roles",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["roles"],
        summary: "Get all roles with permissions",
        security: [{ bearerAuth: [] }],
        response: {
          200: RolesResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(request.user.userId, Resource.USER, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const roles = await getAllRoles();

        reply.send(
          roles.map((r: Role & { permissions: RolePermission[]; _count: { users: number } }) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            isDefault: r.isDefault,
            permissions: r.permissions.map((p: RolePermission) => ({
              resource: p.resource,
              canRead: p.canRead,
              canWrite: p.canWrite,
              canDelete: p.canDelete,
            })),
            _count: r._count,
          }))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch roles";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Get role by ID
  app.get<{ Params: RoleIdParams }>(
    "/roles/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["roles"],
        summary: "Get role by ID with permissions",
        security: [{ bearerAuth: [] }],
        params: RoleIdParamsSchema,
        response: {
          200: RoleResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(request.user.userId, Resource.USER, "read");
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const role = await getRoleById(request.params.id);

        if (!role) {
          return reply.status(404).send({ error: "Role not found" });
        }

        reply.send({
          id: role.id,
          name: role.name,
          description: role.description,
          isDefault: role.isDefault,
          permissions: role.permissions.map((p: RolePermission) => ({
            resource: p.resource,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
          })),
          _count: role._count,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch role";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Create role
  app.post<{ Body: CreateRoleBody }>(
    "/roles",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["roles"],
        summary: "Create a new role",
        security: [{ bearerAuth: [] }],
        body: CreateRoleBodySchema,
        response: {
          201: RoleResponseSchema,
          403: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canWrite = await hasPermission(request.user.userId, Resource.USER, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Check for duplicate name
        const existing = await prisma.role.findUnique({
          where: { name: request.body.name },
        });
        if (existing) {
          return reply.status(409).send({ error: "A role with this name already exists" });
        }

        const role = await createRole(request.body.name, request.body.description);

        reply.status(201).send({
          id: role.id,
          name: role.name,
          description: role.description,
          isDefault: role.isDefault,
          permissions: role.permissions.map((p: RolePermission) => ({
            resource: p.resource,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
          })),
          _count: role._count,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create role";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Update role
  app.put<{ Params: RoleIdParams; Body: UpdateRoleBody }>(
    "/roles/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["roles"],
        summary: "Update a role",
        security: [{ bearerAuth: [] }],
        params: RoleIdParamsSchema,
        body: UpdateRoleBodySchema,
        response: {
          200: RoleResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canWrite = await hasPermission(request.user.userId, Resource.USER, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const existing = await getRoleById(request.params.id);
        if (!existing) {
          return reply.status(404).send({ error: "Role not found" });
        }

        if (existing.isDefault) {
          return reply.status(403).send({ error: "Cannot modify a default role" });
        }

        // Check for duplicate name if name is being changed
        if (request.body.name && request.body.name !== existing.name) {
          const duplicate = await prisma.role.findUnique({
            where: { name: request.body.name },
          });
          if (duplicate) {
            return reply.status(409).send({ error: "A role with this name already exists" });
          }
        }

        const role = await updateRole(request.params.id, {
          name: request.body.name,
          description: request.body.description,
        });

        reply.send({
          id: role.id,
          name: role.name,
          description: role.description,
          isDefault: role.isDefault,
          permissions: role.permissions.map((p: RolePermission) => ({
            resource: p.resource,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
          })),
          _count: role._count,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update role";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Delete role
  app.delete<{ Params: RoleIdParams }>(
    "/roles/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["roles"],
        summary: "Delete a role",
        security: [{ bearerAuth: [] }],
        params: RoleIdParamsSchema,
        response: {
          204: Type.Null(),
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canDel = await hasPermission(request.user.userId, Resource.USER, "delete");
        if (!canDel) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const existing = await getRoleById(request.params.id);
        if (!existing) {
          return reply.status(404).send({ error: "Role not found" });
        }

        if (existing.isDefault) {
          return reply.status(403).send({ error: "Cannot delete a default role" });
        }

        if (existing._count.users > 0) {
          return reply.status(409).send({
            error: "Cannot delete a role that has users assigned to it",
          });
        }

        await deleteRole(request.params.id);

        reply.status(204).send();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete role";
        reply.status(500).send({ error: message });
      }
    }
  );

  // Update role permissions
  app.put<{ Params: RoleIdParams; Body: UpdateRolePermissionsBody }>(
    "/roles/:id/permissions",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["roles"],
        summary: "Update permissions for a role",
        security: [{ bearerAuth: [] }],
        params: RoleIdParamsSchema,
        body: UpdateRolePermissionsBodySchema,
        response: {
          200: RoleResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canWrite = await hasPermission(request.user.userId, Resource.USER, "write");
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const existing = await getRoleById(request.params.id);
        if (!existing) {
          return reply.status(404).send({ error: "Role not found" });
        }

        const role = await updateRolePermissions(
          request.params.id,
          request.body.permissions.map((p) => ({
            resource: p.resource as Resource,
            canRead: p.canRead as PermissionScope,
            canWrite: p.canWrite as PermissionScope,
            canDelete: p.canDelete as PermissionScope,
          }))
        );

        if (!role) {
          return reply.status(500).send({ error: "Failed to update role permissions" });
        }

        reply.send({
          id: role.id,
          name: role.name,
          description: role.description,
          isDefault: role.isDefault,
          permissions: role.permissions.map((p: RolePermission) => ({
            resource: p.resource,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
          })),
          _count: role._count,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update role permissions";
        reply.status(500).send({ error: message });
      }
    }
  );
}
