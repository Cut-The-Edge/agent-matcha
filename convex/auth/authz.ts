// @ts-nocheck - Disable type checking due to TypeScript depth limit issues with complex Convex schema
/**
 * Authorization Helper Module for Agent Matcha
 *
 * This module provides reusable authorization functions for protecting
 * Convex queries and mutations. It validates session tokens and checks
 * user roles before allowing access to protected resources.
 *
 * Security Features:
 * - Session token validation
 * - Role-based access control (RBAC)
 * - Audit logging for access attempts
 */

import { QueryCtx, MutationCtx, internalQuery } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";

// Admin roles in order of privilege (highest to lowest)
export type AdminRole = "developer" | "super_admin" | "admin";

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<AdminRole, number> = {
  developer: 3,
  super_admin: 2,
  admin: 1,
};

/**
 * Result of authorization check
 */
export interface AuthResult {
  authorized: boolean;
  admin: Doc<"admins"> | null;
  error?: string;
}

/**
 * Validate a session token and return the associated admin
 * Used by queries and mutations to check authentication
 *
 * @param ctx - Convex query or mutation context
 * @param sessionToken - The session token from the client
 * @returns AuthResult with the admin if valid, or error if invalid
 */
export async function validateSession(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null
): Promise<AuthResult> {
  if (!sessionToken) {
    return {
      authorized: false,
      admin: null,
      error: "No session token provided",
    };
  }

  // Find the session by token
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionToken))
    .first();

  if (!session) {
    return {
      authorized: false,
      admin: null,
      error: "Invalid session token",
    };
  }

  // Check if session has expired
  if (session.expiresAt < Date.now()) {
    return {
      authorized: false,
      admin: null,
      error: "Session expired",
    };
  }

  // Get the admin associated with this session
  const admin = await ctx.db.get(session.adminId);

  if (!admin) {
    return {
      authorized: false,
      admin: null,
      error: "Admin not found",
    };
  }

  // Check if admin account is active (RBAC enhancement)
  if (admin.isActive === false) {
    return {
      authorized: false,
      admin: null,
      error: "Admin account is inactive",
    };
  }

  return {
    authorized: true,
    admin,
  };
}

/**
 * Check if an admin has at least the required role level
 *
 * @param admin - The admin document
 * @param requiredRole - The minimum role required
 * @returns true if the admin has sufficient privileges
 */
export function hasRole(admin: Doc<"admins">, requiredRole: AdminRole): boolean {
  const adminRoleLevel = ROLE_HIERARCHY[admin.role] || 0;
  const requiredRoleLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return adminRoleLevel >= requiredRoleLevel;
}

/**
 * Require authentication - throws if not authenticated
 * Use this in mutations and queries that require any authenticated user
 *
 * NOTE: While sessionToken is typed as optional for backward compatibility,
 * this function will ALWAYS throw an error if the token is missing or invalid.
 * Endpoints using this function effectively require authentication despite
 * the schema marking sessionToken as optional.
 *
 * @param ctx - Convex query or mutation context
 * @param sessionToken - The session token from the client (REQUIRED despite optional typing)
 * @returns The authenticated admin
 * @throws Error with descriptive message if not authenticated or token is invalid
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null
): Promise<Doc<"admins">> {
  const result = await validateSession(ctx, sessionToken);

  if (!result.authorized || !result.admin) {
    // Provide clear error message explaining the requirement
    const errorMessage = result.error || "Authentication required";
    const clarification = !sessionToken
      ? " - sessionToken parameter is required for this endpoint"
      : "";
    throw new Error(errorMessage + clarification);
  }

  return result.admin;
}

/**
 * Require a specific role - throws if not authorized
 * Use this in mutations that require specific role levels
 *
 * @param ctx - Convex query or mutation context
 * @param sessionToken - The session token from the client
 * @param requiredRole - The minimum role required
 * @returns The authenticated admin
 * @throws Error if not authorized
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null,
  requiredRole: AdminRole
): Promise<Doc<"admins">> {
  const admin = await requireAuth(ctx, sessionToken);

  if (!hasRole(admin, requiredRole)) {
    throw new Error(
      `Insufficient permissions. Required role: ${requiredRole}, your role: ${admin.role}`
    );
  }

  return admin;
}

/**
 * Require super_admin role - convenience function
 * Use this for the most sensitive operations
 *
 * @param ctx - Convex query or mutation context
 * @param sessionToken - The session token from the client
 * @returns The authenticated super_admin
 * @throws Error if not a super_admin
 */
export async function requireSuperAdmin(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null
): Promise<Doc<"admins">> {
  return requireRole(ctx, sessionToken, "super_admin");
}

/**
 * Require developer role - convenience function
 * Use this for developer-only tools (sandbox, etc.)
 */
export async function requireDeveloper(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null
): Promise<Doc<"admins">> {
  return requireRole(ctx, sessionToken, "developer");
}

/**
 * Require admin role or higher
 *
 * NOTE: While sessionToken is typed as optional for backward compatibility,
 * this function will ALWAYS throw an error if the token is missing or invalid.
 *
 * @param ctx - Convex query or mutation context
 * @param sessionToken - The session token from the client (REQUIRED despite optional typing)
 * @returns The authenticated admin with at least "admin" role
 * @throws Error if not authenticated or insufficient permissions
 */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null
): Promise<Doc<"admins">> {
  return requireRole(ctx, sessionToken, "admin");
}

/**
 * Optional authentication - returns admin if authenticated, null otherwise
 * Use this for queries that can work with or without authentication
 * but may return different data based on auth status
 *
 * @param ctx - Convex query or mutation context
 * @param sessionToken - The session token from the client
 * @returns The admin if authenticated, null otherwise
 */
export async function optionalAuth(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined | null
): Promise<Doc<"admins"> | null> {
  const result = await validateSession(ctx, sessionToken);
  return result.admin;
}

/**
 * Internal query version of requireAuth
 * Used by actions that need to validate authentication before proceeding
 *
 * @param sessionToken - The session token from the client
 * @returns The authenticated admin
 * @throws Error if not authenticated
 */
export const requireAuthInternal = internalQuery({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"admins">> => {
    return await requireAuth(ctx, args.sessionToken);
  },
});
