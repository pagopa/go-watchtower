import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
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
  invalidatePermissionCache,
  invalidateAllPermissionCaches,
} from "../../services/permission.service.js";
import { requirePermission } from "../../lib/require-permission.js";
import { hashPassword } from "../../utils/password.js";
import { buildDiff } from "../../services/system-event.service.js";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import { HttpError } from "../../utils/http-errors.js";
import { fromJsonOr } from "../../utils/json-cast.js";
import type { UserPreferences } from "@go-watchtower/shared";
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
      onRequest: [app.authenticate, requirePermission(Resource.USER, "read")],
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
    async (_request, reply) => {
      try {
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
        HttpError.internal(reply, message);
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
          return HttpError.notFound(reply, "User");
        }

        reply.send(fromJsonOr<UserPreferences>(user.preferences, {}));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch preferences";
        HttpError.internal(reply, message);
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
          return HttpError.notFound(reply, "User");
        }

        const current = fromJsonOr<UserPreferences>(user.preferences, {});
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

        reply.send(fromJsonOr<UserPreferences>(updated.preferences, {}));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update preferences";
        HttpError.internal(reply, message);
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
      onRequest: [app.authenticate, requirePermission(Resource.USER, "read")],
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
          return HttpError.notFound(reply, "User");
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
        HttpError.internal(reply, message);
      }
    }
  );

  // Create user
  app.post<{ Body: CreateUserBody }>(
    "/users",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "write")],
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
        const existingUser = await prisma.user.findUnique({
          where: { email: request.body.email },
        });

        if (existingUser) {
          return HttpError.badRequest(reply, "User with this email already exists");
        }

        // If no roleId, use default role
        let roleId = request.body.roleId;
        if (!roleId) {
          const defaultRole = await prisma.role.findFirst({
            where: { isDefault: true },
          });
          if (!defaultRole) {
            return HttpError.internal(reply, "Default role not configured");
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

        request.auditEvents.push({
          action: SystemEventActions.USER_CREATED,
          resource: SystemEventResources.USERS,
          resourceId: user.id,
          resourceLabel: user.email,
          metadata: { created: user },
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
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Update user
  app.put<{ Params: UserIdParams; Body: UpdateUserBody }>(
    "/users/:id",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "write")],
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
        // Read existing user before update for diffing
        const existing = await prisma.user.findUnique({
          where: { id: request.params.id },
          include: { role: true },
        });

        if (!existing) {
          return HttpError.notFound(reply, "User");
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

        const eventBase = {
          resource: SystemEventResources.USERS,
          resourceId: user.id,
          resourceLabel: user.email,
        } as const;

        request.auditEvents.push({
          action: SystemEventActions.USER_UPDATED,
          ...eventBase,
          metadata: {
            changes: buildDiff(
              { name: existing.name, email: existing.email, isActive: existing.isActive, roleId: existing.roleId },
              { name: user.name, email: user.email, isActive: user.isActive, roleId: user.roleId },
            ),
          },
        });

        // Granular events based on what changed
        if (request.body.isActive !== undefined && request.body.isActive !== existing.isActive) {
          request.auditEvents.push({
            action: request.body.isActive
              ? SystemEventActions.USER_ACTIVATED
              : SystemEventActions.USER_DEACTIVATED,
            ...eventBase,
          });
        }

        if (request.body.roleId !== undefined && request.body.roleId !== existing.roleId) {
          request.auditEvents.push({
            action: SystemEventActions.USER_ROLE_CHANGED,
            ...eventBase,
            metadata: {
              previousRole: existing.role.name,
              newRole: user.role.name,
            },
          });
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
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update user";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "User");
        }
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Delete user
  app.delete<{ Params: UserIdParams }>(
    "/users/:id",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "delete")],
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
        // Prevent self-deletion
        if (request.params.id === request.user.userId) {
          return HttpError.badRequest(reply, "Cannot delete your own account");
        }

        // Fetch user info before deletion for audit purposes
        const userToDelete = await prisma.user.findUnique({
          where: { id: request.params.id },
          select: { id: true, email: true },
        });

        await prisma.user.delete({
          where: { id: request.params.id },
        });

        request.auditEvents.push({
          action: SystemEventActions.USER_DELETED,
          resource: SystemEventResources.USERS,
          resourceId: request.params.id,
          resourceLabel: userToDelete?.email ?? null,
        });

        reply.send({ message: "User deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete user";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "User");
        }
        HttpError.internal(reply, message);
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
      onRequest: [app.authenticate, requirePermission(Resource.USER, "read")],
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
        const user = await prisma.user.findUnique({
          where: { id: request.params.id },
          include: {
            role: {
              include: { permissions: true },
            },
          },
        });

        if (!user) {
          return HttpError.notFound(reply, "User");
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
        HttpError.internal(reply, message);
      }
    }
  );

  // Set permission override
  app.put<{ Params: UserIdParams; Body: SetPermissionOverrideBody }>(
    "/users/:id/permissions",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "write")],
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
        const user = await prisma.user.findUnique({
          where: { id: request.params.id },
        });

        if (!user) {
          return HttpError.notFound(reply, "User");
        }

        // Check if an override already exists to determine create vs update
        const existingOverride = await prisma.userPermissionOverride.findUnique({
          where: {
            userId_resource: {
              userId: request.params.id,
              resource: request.body.resource,
            },
          },
        });

        await setUserPermissionOverride(
          request.params.id,
          request.body.resource,
          {
            canRead: request.body.canRead,
            canWrite: request.body.canWrite,
            canDelete: request.body.canDelete,
          },
          request.user.userId,
          request.body.reason
        );
        invalidatePermissionCache(request.params.id);

        request.auditEvents.push({
          action: existingOverride
            ? SystemEventActions.PERMISSION_OVERRIDE_UPDATED
            : SystemEventActions.PERMISSION_OVERRIDE_CREATED,
          resource: SystemEventResources.USER_PERMISSION_OVERRIDES,
          resourceId: request.params.id,
          resourceLabel: user.email,
          metadata: existingOverride
            ? {
                permissionResource: request.body.resource,
                changes: buildDiff(
                  { canRead: existingOverride.canRead, canWrite: existingOverride.canWrite, canDelete: existingOverride.canDelete },
                  { canRead: request.body.canRead, canWrite: request.body.canWrite, canDelete: request.body.canDelete },
                ),
              }
            : {
                permissionResource: request.body.resource,
                canRead: request.body.canRead,
                canWrite: request.body.canWrite,
                canDelete: request.body.canDelete,
              },
        });

        reply.send({ message: "Permission override set successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to set permission override";
        HttpError.internal(reply, message);
      }
    }
  );

  // Remove permission override
  app.delete<{ Params: UserPermissionResourceParams }>(
    "/users/:id/permissions/:resource",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "write")],
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
        const user = await prisma.user.findUnique({
          where: { id: request.params.id },
        });

        if (!user) {
          return HttpError.notFound(reply, "User");
        }

        const removed = await removeUserPermissionOverride(
          request.params.id,
          request.params.resource as Resource
        );

        if (!removed) {
          return HttpError.notFound(reply, "Permission override");
        }
        invalidatePermissionCache(request.params.id);

        request.auditEvents.push({
          action: SystemEventActions.PERMISSION_OVERRIDE_DELETED,
          resource: SystemEventResources.USER_PERMISSION_OVERRIDES,
          resourceId: request.params.id,
          resourceLabel: user.email,
          metadata: { permissionResource: request.params.resource },
        });

        reply.send({ message: "Permission override removed successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to remove permission override";
        HttpError.internal(reply, message);
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
      onRequest: [app.authenticate, requirePermission(Resource.USER, "read")],
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
    async (_request, reply) => {
      try {
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
        HttpError.internal(reply, message);
      }
    }
  );

  // Get role by ID
  app.get<{ Params: RoleIdParams }>(
    "/roles/:id",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "read")],
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
        const role = await getRoleById(request.params.id);

        if (!role) {
          return HttpError.notFound(reply, "Role");
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
        HttpError.internal(reply, message);
      }
    }
  );

  // Create role
  app.post<{ Body: CreateRoleBody }>(
    "/roles",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "write")],
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
        // Check for duplicate name
        const existing = await prisma.role.findUnique({
          where: { name: request.body.name },
        });
        if (existing) {
          return HttpError.conflict(reply, "A role with this name already exists");
        }

        const role = await createRole(request.body.name, request.body.description);

        request.auditEvents.push({
          action: SystemEventActions.ROLE_CREATED,
          resource: SystemEventResources.ROLES,
          resourceId: role.id,
          resourceLabel: role.name,
          metadata: { created: role },
        });

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
        HttpError.internal(reply, message);
      }
    }
  );

  // Update role
  app.put<{ Params: RoleIdParams; Body: UpdateRoleBody }>(
    "/roles/:id",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "write")],
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
        const existing = await getRoleById(request.params.id);
        if (!existing) {
          return HttpError.notFound(reply, "Role");
        }

        if (existing.isDefault) {
          return HttpError.forbidden(reply, "Cannot modify a default role");
        }

        // Check for duplicate name if name is being changed
        if (request.body.name && request.body.name !== existing.name) {
          const duplicate = await prisma.role.findUnique({
            where: { name: request.body.name },
          });
          if (duplicate) {
            return HttpError.conflict(reply, "A role with this name already exists");
          }
        }

        const role = await updateRole(request.params.id, {
          name: request.body.name,
          description: request.body.description,
        });

        request.auditEvents.push({
          action: SystemEventActions.ROLE_UPDATED,
          resource: SystemEventResources.ROLES,
          resourceId: role.id,
          resourceLabel: role.name,
          metadata: {
            changes: buildDiff(
              { name: existing.name, description: existing.description },
              { name: role.name, description: role.description },
            ),
          },
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
        HttpError.internal(reply, message);
      }
    }
  );

  // Delete role
  app.delete<{ Params: RoleIdParams }>(
    "/roles/:id",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "delete")],
      schema: {
        tags: ["roles"],
        summary: "Delete a role",
        security: [{ bearerAuth: [] }],
        params: RoleIdParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existing = await getRoleById(request.params.id);
        if (!existing) {
          return HttpError.notFound(reply, "Role");
        }

        if (existing.isDefault) {
          return HttpError.forbidden(reply, "Cannot delete a default role");
        }

        if (existing._count.users > 0) {
          return HttpError.conflict(reply, "Cannot delete a role that has users assigned to it");
        }

        await deleteRole(request.params.id);
        invalidateAllPermissionCaches();

        request.auditEvents.push({
          action: SystemEventActions.ROLE_DELETED,
          resource: SystemEventResources.ROLES,
          resourceId: request.params.id,
          resourceLabel: existing.name,
        });

        return reply.send({ message: "Role deleted successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete role";
        HttpError.internal(reply, message);
      }
    }
  );

  // Update role permissions
  app.put<{ Params: RoleIdParams; Body: UpdateRolePermissionsBody }>(
    "/roles/:id/permissions",
    {
      onRequest: [app.authenticate, requirePermission(Resource.USER, "write")],
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
        const existing = await getRoleById(request.params.id);
        if (!existing) {
          return HttpError.notFound(reply, "Role");
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
        invalidateAllPermissionCaches();

        if (!role) {
          return HttpError.internal(reply, "Failed to update role permissions");
        }

        request.auditEvents.push({
          action: SystemEventActions.ROLE_PERMISSIONS_UPDATED,
          resource: SystemEventResources.ROLES,
          resourceId: role.id,
          resourceLabel: role.name,
          metadata: {
            permissions: request.body.permissions,
          },
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
        const message = error instanceof Error ? error.message : "Failed to update role permissions";
        HttpError.internal(reply, message);
      }
    }
  );
}
