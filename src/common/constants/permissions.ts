import { UserRole } from '../../module/users/enums/users.enum';

// Comprehensive permissions constants to prevent typos
export const PERMISSIONS = {
  // Home/Dashboard permissions
  HOME: {
    VIEW: 'home.view',
  },

  DASHBOARD:{
    VIEW: 'dashboard.view',
  },
  
  // Sensor management permissions
  SENSORS: {
    VIEW: 'sensors.view',
    LIVE: 'sensors.live',
    ADD: 'sensors.add',
    UPDATE: 'sensors.update',
    DELETE: 'sensors.delete',
  },
  
  // Gateway management permissions
  GATEWAYS: {
    VIEW: 'gateways.view',
    DETAILS: 'gateways.details',
    ADD: 'gateways.add',
    UPDATE: 'gateways.update',
    DELETE: 'gateways.delete',
  },
  
  // User management permissions
  TEAMS: {
    VIEW_MEMBERS: 'teams.view.members',
    REMOVE_MEMBERS: 'teams.remove.members',
    MANAGE_ROLES: 'teams.roles',
    MANAGE_PERMISSIONS: 'teams.permissions'
  },
  
  // Invite management permissions
  INVITES: {
    VIEW: 'invites.view',
    CREATE: 'invites.create',
    REVOKE: 'invites.revoke',
    // MANAGE: 'invites.manage'
  },
  
  // Settings permissions
  SETTINGS: {
    VIEW: 'settings.view',
    RENAME_ORG: 'settings.rename_org',
    UPDATE_SENSOR_OFFLINE_TIME: 'settings.update_sensor_offline_time',
  }
} as const;


// Extract all permission strings for validation
export const ALL_PERMISSIONS = Object.values(PERMISSIONS).flatMap(section =>
  Object.values(section)
) as string[];

export const RoleBaselines: Record<UserRole, string[]> = {
  [UserRole.OWNER]: ALL_PERMISSIONS, // Owners have all permissions
  [UserRole.ADMIN]: [
    // Home access
    PERMISSIONS.HOME.VIEW,

    // Dashboard access
    PERMISSIONS.DASHBOARD.VIEW,

    // Full sensor management
    PERMISSIONS.SENSORS.VIEW,
    PERMISSIONS.SENSORS.LIVE,
    PERMISSIONS.SENSORS.ADD,
    PERMISSIONS.SENSORS.UPDATE,
    PERMISSIONS.SENSORS.DELETE,

    // Full gateway management
    PERMISSIONS.GATEWAYS.VIEW,
    PERMISSIONS.GATEWAYS.DETAILS,
    PERMISSIONS.GATEWAYS.ADD,
    PERMISSIONS.GATEWAYS.UPDATE,
    PERMISSIONS.GATEWAYS.DELETE,

    PERMISSIONS.TEAMS.VIEW_MEMBERS,
    PERMISSIONS.TEAMS.REMOVE_MEMBERS,
    PERMISSIONS.TEAMS.MANAGE_ROLES,
    PERMISSIONS.TEAMS.MANAGE_PERMISSIONS,

    // Invite management
    PERMISSIONS.INVITES.VIEW,
    PERMISSIONS.INVITES.CREATE,
    PERMISSIONS.INVITES.REVOKE,

    // Settings management
    PERMISSIONS.SETTINGS.VIEW,
    PERMISSIONS.SETTINGS.RENAME_ORG,
    PERMISSIONS.SETTINGS.UPDATE_SENSOR_OFFLINE_TIME,

  ],
  [UserRole.MEMBER]: [
    // Home access
    PERMISSIONS.HOME.VIEW,

    // Dashboard access
    PERMISSIONS.DASHBOARD.VIEW,

    // Full sensor management
    PERMISSIONS.SENSORS.VIEW,
    PERMISSIONS.SENSORS.LIVE,

    // Full gateway management
    PERMISSIONS.GATEWAYS.VIEW,
    PERMISSIONS.GATEWAYS.DETAILS,

    PERMISSIONS.TEAMS.VIEW_MEMBERS,

    // Invite management,

    // Settings management

  ],
  [UserRole.VIEWER]: [
    // Home access
    PERMISSIONS.HOME.VIEW,

    // Dashboard access
    // PERMISSIONS.DASHBOARD.VIEW,

    // Full sensor management
    PERMISSIONS.SENSORS.VIEW,
    // PERMISSIONS.SENSORS.LIVE,

    // Full gateway management
    PERMISSIONS.GATEWAYS.VIEW,
    // PERMISSIONS.GATEWAYS.DETAILS,

    // PERMISSIONS.TEAMS.VIEW_MEMBERS,

    // Invite management,

    // Settings management

  ]
};

/**
 * Compute effective permissions for a user based on role baseline, allow, and deny lists
 */
export function computeEffectivePermissions(
  role: UserRole,
  allow: string[] = [],
  deny: string[] = []
): string[] {
  const baseline = new Set(RoleBaselines[role] || []);
  
  // Add allowed permissions
  allow.forEach(permission => {
    if (ALL_PERMISSIONS.includes(permission)) {
      baseline.add(permission);
    }
  });
  
  // Remove denied permissions
  deny.forEach(permission => {
    baseline.delete(permission);
  });
  
  return Array.from(baseline);
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  effectivePermissions: string[],
  requiredPermission: string
): boolean {
  return effectivePermissions.includes(requiredPermission);
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(
  effectivePermissions: string[],
  requiredPermissions: string[]
): boolean {
  return requiredPermissions.some(permission => 
    effectivePermissions.includes(permission)
  );
}
