// backend/src/middleware/rbac.js

const ROLE_HIERARCHY = { readonly: 0, admin: 1, superadmin: 2 };

export function hasRole(userRole, requiredRole) {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function requireRole(minRole) {
  return async (req, res, next) => {
    const userRole = req.user?.role || 'readonly';
    if (!hasRole(userRole, minRole)) {
      return res.status(403).json({
        error: 'Forbidden: insufficient privileges.',
        required: minRole,
        current: userRole,
      });
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');
export const requireSuperAdmin = requireRole('superadmin');
