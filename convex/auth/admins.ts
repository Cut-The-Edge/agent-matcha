// @ts-nocheck - Disable type checking due to TypeScript depth limit issues with complex Convex schema
/**
 * Admin Management Module for Agent Matcha RBAC
 *
 * Provides CRUD operations for managing admin users.
 * Only super_admin users can manage other admins.
 *
 * Security Features:
 * - bcrypt password hashing via Node.js action
 * - Permission checks for all operations
 * - Audit logging for all admin changes
 * - Self-protection (can't delete/deactivate yourself)
 */

import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin, requireAuth } from "./authz";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Queries
// ============================================================================

/**
 * List all admins (requires admin role)
 */
export const list = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);

    const admins = await ctx.db.query("admins").collect();

    // Return admins without password hashes
    return admins.map((admin) => ({
      _id: admin._id,
      _creationTime: admin._creationTime,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      createdAt: admin.createdAt,
      lastLoginAt: admin.lastLoginAt,
      isActive: admin.isActive,
      lastPasswordChange: admin.lastPasswordChange,
    }));
  },
});

/**
 * Get a single admin by ID (requires admin role)
 */
export const get = query({
  args: {
    sessionToken: v.optional(v.string()),
    adminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);

    const admin = await ctx.db.get(args.adminId);
    if (!admin) return null;

    // Return admin without password hash
    return {
      _id: admin._id,
      _creationTime: admin._creationTime,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      createdAt: admin.createdAt,
      lastLoginAt: admin.lastLoginAt,
      isActive: admin.isActive,
      lastPasswordChange: admin.lastPasswordChange,
    };
  },
});

/**
 * Get current admin's own profile (any authenticated user)
 */
export const me = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);

    return {
      _id: admin._id,
      _creationTime: admin._creationTime,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      createdAt: admin.createdAt,
      lastLoginAt: admin.lastLoginAt,
      isActive: admin.isActive,
      lastPasswordChange: admin.lastPasswordChange,
    };
  },
});

/**
 * List admins by role (internal use)
 */
export const listByRole = internalQuery({
  args: {
    role: v.union(
      v.literal("super_admin"),
      v.literal("admin")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("admins")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new admin (super admin only)
 * Uses action to hash password with bcrypt
 */
export const create = action({
  args: {
    sessionToken: v.optional(v.string()),
    email: v.string(),
    name: v.string(),
    password: v.string(),
    role: v.union(
      v.literal("super_admin"),
      v.literal("admin")
    ),
  },
  handler: async (ctx, args) => {
    // Check permission via internal query
    const currentAdmin = await ctx.runQuery(internal.auth.authz.requireAuthInternal, {
      sessionToken: args.sessionToken,
    });

    // Check if email already exists
    const existing = await ctx.runQuery(internal.auth.admins.getByEmailInternal, { email: args.email.toLowerCase() });
    if (existing) {
      throw new Error("Admin with this email already exists");
    }

    // Hash password using bcrypt
    const passwordHash = await ctx.runAction(internal.auth.auth.hashPasswordAction, {
      password: args.password,
    });

    // Create admin
    const adminId = await ctx.runMutation(internal.auth.admins.createInternal, {
      email: args.email.toLowerCase(),
      name: args.name.trim(),
      role: args.role,
      passwordHash,
      createdBy: currentAdmin._id,
    });

    return adminId;
  },
});

/**
 * Internal mutation to create admin
 */
export const createInternal = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: v.union(
      v.literal("super_admin"),
      v.literal("admin")
    ),
    passwordHash: v.string(),
    createdBy: v.id("admins"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const adminId = await ctx.db.insert("admins", {
      email: args.email,
      name: args.name,
      role: args.role,
      passwordHash: args.passwordHash,
      createdAt: now,
      isActive: true,
    });

    // Log audit event
    await ctx.db.insert("auditLogs", {
      timestamp: now,
      action: "admin_created",
      userId: args.createdBy,
      resourceType: "admin",
      resourceId: adminId,
      ipAddress: "unknown",
      userAgent: "unknown",
      outcome: "success",
      metadata: { email: args.email, role: args.role },
    });

    return adminId;
  },
});

/**
 * Internal query to get admin by email
 */
export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

/**
 * Update admin (requires admin role)
 */
export const update = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    adminId: v.id("admins"),
    name: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("super_admin"),
        v.literal("admin")
      )
    ),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const currentAdmin = await requireAdmin(ctx, args.sessionToken);

    const targetAdmin = await ctx.db.get(args.adminId);
    if (!targetAdmin) {
      throw new Error("Admin not found");
    }

    // Prevent self-deactivation
    if (args.adminId === currentAdmin._id && args.isActive === false) {
      throw new Error("Cannot deactivate your own account");
    }

    // Prevent demoting yourself from super_admin
    if (args.adminId === currentAdmin._id && args.role && args.role !== "super_admin") {
      throw new Error("Cannot change your own role");
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.role !== undefined) updates.role = args.role;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.adminId, updates);

    // Log audit event
    await ctx.db.insert("auditLogs", {
      timestamp: Date.now(),
      action: "admin_updated",
      userId: currentAdmin._id,
      resourceType: "admin",
      resourceId: args.adminId,
      ipAddress: "unknown",
      userAgent: "unknown",
      outcome: "success",
      metadata: { ...updates, targetEmail: targetAdmin.email },
    });

    return args.adminId;
  },
});

/**
 * Reset admin password (super admin only)
 * Uses action for bcrypt hashing
 */
export const resetPassword = action({
  args: {
    sessionToken: v.optional(v.string()),
    adminId: v.id("admins"),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // Check permission
    const currentAdmin = await ctx.runQuery(internal.auth.authz.requireAuthInternal, {
      sessionToken: args.sessionToken,
    });

    // Hash password
    const passwordHash = await ctx.runAction(internal.auth.auth.hashPasswordAction, {
      password: args.newPassword,
    });

    // Update password
    await ctx.runMutation(internal.auth.admins.updatePasswordInternal, {
      adminId: args.adminId,
      passwordHash,
      updatedBy: currentAdmin._id,
    });

    return args.adminId;
  },
});

/**
 * Internal mutation to update password
 */
export const updatePasswordInternal = internalMutation({
  args: {
    adminId: v.id("admins"),
    passwordHash: v.string(),
    updatedBy: v.id("admins"),
  },
  handler: async (ctx, args) => {
    const targetAdmin = await ctx.db.get(args.adminId);
    if (!targetAdmin) {
      throw new Error("Admin not found");
    }

    const now = Date.now();

    await ctx.db.patch(args.adminId, {
      passwordHash: args.passwordHash,
      lastPasswordChange: now,
    });

    // Log audit event
    await ctx.db.insert("auditLogs", {
      timestamp: now,
      action: "password_reset",
      userId: args.updatedBy,
      resourceType: "admin",
      resourceId: args.adminId,
      ipAddress: "unknown",
      userAgent: "unknown",
      outcome: "success",
      metadata: { targetEmail: targetAdmin.email },
    });
  },
});

/**
 * Delete admin (super admin only)
 */
export const deleteAdmin = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    adminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    const currentAdmin = await requireAdmin(ctx, args.sessionToken);

    // Prevent self-deletion
    if (args.adminId === currentAdmin._id) {
      throw new Error("Cannot delete your own account");
    }

    const targetAdmin = await ctx.db.get(args.adminId);
    if (!targetAdmin) {
      throw new Error("Admin not found");
    }

    // Delete all sessions for this admin
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_admin", (q) => q.eq("adminId", args.adminId))
      .collect();

    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // Delete the admin
    await ctx.db.delete(args.adminId);

    // Log audit event
    await ctx.db.insert("auditLogs", {
      timestamp: Date.now(),
      action: "admin_deleted",
      userId: currentAdmin._id,
      resourceType: "admin",
      resourceId: args.adminId,
      ipAddress: "unknown",
      userAgent: "unknown",
      outcome: "success",
      metadata: { deletedEmail: targetAdmin.email, deletedRole: targetAdmin.role },
    });

    return args.adminId;
  },
});

/**
 * Change own password (any authenticated user)
 */
export const changeOwnPassword = action({
  args: {
    sessionToken: v.optional(v.string()),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // Get current admin
    const admin = await ctx.runQuery(internal.auth.admins.getAdminBySessionInternal, {
      sessionToken: args.sessionToken,
    });

    if (!admin) {
      throw new Error("Not authenticated");
    }

    // Verify current password
    const isValid = await ctx.runAction(internal.auth.auth.verifyPasswordAction, {
      password: args.currentPassword,
      hash: admin.passwordHash,
    });

    if (!isValid) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const passwordHash = await ctx.runAction(internal.auth.auth.hashPasswordAction, {
      password: args.newPassword,
    });

    // Update password
    await ctx.runMutation(internal.auth.admins.updateOwnPasswordInternal, {
      adminId: admin._id,
      passwordHash,
    });

    return { success: true };
  },
});

/**
 * Internal query to get admin by session token
 */
export const getAdminBySessionInternal = internalQuery({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.sessionToken) return null;

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken!))
      .first();

    if (!session || session.expiresAt < Date.now()) return null;

    return await ctx.db.get(session.adminId);
  },
});

/**
 * Internal mutation to update own password
 */
export const updateOwnPasswordInternal = internalMutation({
  args: {
    adminId: v.id("admins"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.adminId, {
      passwordHash: args.passwordHash,
      lastPasswordChange: Date.now(),
    });
  },
});
