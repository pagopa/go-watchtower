import { prisma, Resource, PermissionScope } from "@go-watchtower/database";

export type PermissionAction = "read" | "write" | "delete";

export interface UserPermissions {
  [resource: string]: {
    canRead: PermissionScope;
    canWrite: PermissionScope;
    canDelete: PermissionScope;
  };
}

/**
 * Get effective permissions for a user.
 * Combines role permissions with user-specific overrides.
 */
export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: true,
        },
      },
      permissionOverrides: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const permissions: UserPermissions = {};

  // Start with role permissions
  for (const rolePermission of user.role.permissions) {
    permissions[rolePermission.resource] = {
      canRead: rolePermission.canRead,
      canWrite: rolePermission.canWrite,
      canDelete: rolePermission.canDelete,
    };
  }

  // Apply user-specific overrides
  for (const override of user.permissionOverrides) {
    let resourcePerm = permissions[override.resource];
    if (!resourcePerm) {
      resourcePerm = {
        canRead: PermissionScope.NONE,
        canWrite: PermissionScope.NONE,
        canDelete: PermissionScope.NONE,
      };
      permissions[override.resource] = resourcePerm;
    }

    // Only override if explicitly set (not null)
    if (override.canRead !== null) {
      resourcePerm.canRead = override.canRead;
    }
    if (override.canWrite !== null) {
      resourcePerm.canWrite = override.canWrite;
    }
    if (override.canDelete !== null) {
      resourcePerm.canDelete = override.canDelete;
    }
  }

  return permissions;
}

/**
 * Get the effective PermissionScope for a user on a specific resource/action.
 */
export async function getPermissionScope(
  userId: string,
  resource: Resource,
  action: PermissionAction
): Promise<PermissionScope> {
  const permissions = await getUserPermissions(userId);
  const resourcePermissions = permissions[resource];

  if (!resourcePermissions) {
    return PermissionScope.NONE;
  }

  switch (action) {
    case "read":
      return resourcePermissions.canRead;
    case "write":
      return resourcePermissions.canWrite;
    case "delete":
      return resourcePermissions.canDelete;
    default:
      return PermissionScope.NONE;
  }
}

/**
 * Check if a user has a specific permission on a resource.
 * Backward-compatible: returns true if scope is not NONE (i.e. OWN or ALL).
 */
export async function hasPermission(
  userId: string,
  resource: Resource,
  action: PermissionAction
): Promise<boolean> {
  const scope = await getPermissionScope(userId, resource, action);
  return scope !== PermissionScope.NONE;
}

/**
 * Check if a user has permission for a specific resource instance,
 * taking ownership into account.
 *
 * - ALL: always allowed
 * - OWN: allowed only if ownerId === userId
 * - NONE: never allowed
 */
export async function hasPermissionForResource(
  userId: string,
  resource: Resource,
  action: PermissionAction,
  ownerId: string
): Promise<boolean> {
  const scope = await getPermissionScope(userId, resource, action);

  switch (scope) {
    case PermissionScope.ALL:
      return true;
    case PermissionScope.OWN:
      return ownerId === userId;
    case PermissionScope.NONE:
      return false;
    default:
      return false;
  }
}

/**
 * Grant or revoke a specific permission for a user.
 * This creates or updates a permission override.
 */
export async function setUserPermissionOverride(
  userId: string,
  resource: Resource,
  permissions: {
    canRead?: PermissionScope | null;
    canWrite?: PermissionScope | null;
    canDelete?: PermissionScope | null;
  },
  grantedBy?: string,
  reason?: string
): Promise<void> {
  await prisma.userPermissionOverride.upsert({
    where: {
      userId_resource: {
        userId,
        resource,
      },
    },
    update: {
      canRead: permissions.canRead,
      canWrite: permissions.canWrite,
      canDelete: permissions.canDelete,
      grantedBy,
      reason,
    },
    create: {
      userId,
      resource,
      canRead: permissions.canRead,
      canWrite: permissions.canWrite,
      canDelete: permissions.canDelete,
      grantedBy,
      reason,
    },
  });
}

/**
 * Remove a permission override for a user.
 * The user will then inherit permissions from their role.
 */
export async function removeUserPermissionOverride(
  userId: string,
  resource: Resource
): Promise<boolean> {
  try {
    await prisma.userPermissionOverride.delete({
      where: {
        userId_resource: {
          userId,
          resource,
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all permission overrides for a user.
 */
export async function getUserPermissionOverrides(userId: string) {
  return prisma.userPermissionOverride.findMany({
    where: { userId },
    include: {
      grantedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Change a user's role.
 */
export async function changeUserRole(
  userId: string,
  roleName: string
): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
  });

  if (!role) {
    throw new Error(`Role "${roleName}" not found`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { roleId: role.id },
  });
}

/**
 * Get all available roles.
 */
export async function getAllRoles() {
  return prisma.role.findMany({
    include: {
      permissions: true,
      _count: {
        select: { users: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Get role by name with permissions.
 */
export async function getRoleByName(name: string) {
  return prisma.role.findUnique({
    where: { name },
    include: {
      permissions: true,
    },
  });
}

/**
 * Get a single role by ID with permissions and user count.
 */
export async function getRoleById(id: string) {
  return prisma.role.findUnique({
    where: { id },
    include: { permissions: true, _count: { select: { users: true } } },
  });
}

/**
 * Create a new role with NONE permissions for all resources.
 */
export async function createRole(name: string, description?: string) {
  const resources = Object.values(Resource);
  return prisma.role.create({
    data: {
      name,
      description: description ?? null,
      isDefault: false,
      permissions: {
        create: resources.map((r) => ({
          resource: r,
          canRead: PermissionScope.NONE,
          canWrite: PermissionScope.NONE,
          canDelete: PermissionScope.NONE,
        })),
      },
    },
    include: { permissions: true, _count: { select: { users: true } } },
  });
}

/**
 * Update a role's name and/or description.
 */
export async function updateRole(
  id: string,
  data: { name?: string; description?: string | null }
) {
  return prisma.role.update({
    where: { id },
    data,
    include: { permissions: true, _count: { select: { users: true } } },
  });
}

/**
 * Delete a role by ID.
 */
export async function deleteRole(id: string) {
  return prisma.role.delete({ where: { id } });
}

/**
 * Update all permissions for a role using upsert per resource.
 */
export async function updateRolePermissions(
  roleId: string,
  permissions: Array<{
    resource: Resource;
    canRead: PermissionScope;
    canWrite: PermissionScope;
    canDelete: PermissionScope;
  }>
) {
  await prisma.$transaction(
    permissions.map((p) =>
      prisma.rolePermission.upsert({
        where: { roleId_resource: { roleId, resource: p.resource } },
        update: {
          canRead: p.canRead,
          canWrite: p.canWrite,
          canDelete: p.canDelete,
        },
        create: {
          roleId,
          resource: p.resource,
          canRead: p.canRead,
          canWrite: p.canWrite,
          canDelete: p.canDelete,
        },
      })
    )
  );
  return getRoleById(roleId);
}
