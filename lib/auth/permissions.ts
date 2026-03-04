// Canonical RBAC permission matrix for Aether.
// This is the SINGLE source of truth for roles and permissions.
// All server-side and client-side authorization must reference this module.

/**
 * Ordered role hierarchy (highest → lowest privilege).
 * "member" is a legacy alias — mapped to "editor" in migrations.
 */
export const ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Roles that can be assigned via invitation (owner is implicit on org creation). */
export const INVITABLE_ROLES = ['admin', 'editor', 'viewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  // Dashboard & read access
  'view_dashboard',
  'view_performance',
  'view_alerts',
  'use_ai_assistant',

  // Data operations
  'edit_data',
  'upload_data',
  'export_data',

  // Team & org management
  'manage_team',       // invite/remove members
  'change_roles',      // change another member's role (owner only)
  'manage_integrations',

  // Billing & admin
  'manage_billing',
  'view_audit_log',
  'manage_settings',   // security, notifications, general settings

  // Destructive
  'delete_organization',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// ---------------------------------------------------------------------------
// Role → Permission mapping
// ---------------------------------------------------------------------------

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>(PERMISSIONS), // owner can do everything

  admin: new Set<Permission>([
    'view_dashboard',
    'view_performance',
    'view_alerts',
    'use_ai_assistant',
    'edit_data',
    'upload_data',
    'export_data',
    'manage_team',
    'manage_integrations',
    'view_audit_log',
    'manage_settings',
  ]),

  editor: new Set<Permission>([
    'view_dashboard',
    'view_performance',
    'view_alerts',
    'use_ai_assistant',
    'edit_data',
    'upload_data',
    'export_data',
  ]),

  viewer: new Set<Permission>([
    'view_dashboard',
    'view_performance',
    'view_alerts',
    'use_ai_assistant',
  ]),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a role has a specific permission. */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** Return the numeric privilege level (higher = more privileged). */
export function roleLevel(role: Role): number {
  const index = ROLES.indexOf(role);
  return index === -1 ? 0 : ROLES.length - index;
}

/** Check if `role` is at least as privileged as `minimumRole`. */
export function isAtLeast(role: Role, minimumRole: Role): boolean {
  return roleLevel(role) >= roleLevel(minimumRole);
}

/** Validate that a string is a known Role. */
export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Validate that a string is an invitable role. */
export function isInvitableRole(value: string): value is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(value);
}
