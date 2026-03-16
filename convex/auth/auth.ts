// @ts-nocheck - Disable type checking due to TypeScript depth limit issues with complex Convex schema
/**
 * Authentication Module for Agent Matcha
 *
 * Security Features:
 * - bcrypt password hashing with salt (via Convex action with "use node")
 * - Secure session management with token-based authentication
 * - Session expiration and validation
 * - Audit logging for all auth events
 */

import { mutation, query, action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

// Session duration: 7 days in milliseconds
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Generate a secure session token (64 hex characters = 32 bytes)
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// Password Hashing with bcrypt (Node.js action)
// ============================================================================

/**
 * Hash a password using bcrypt with proper salt
 * This is a Convex action that runs in Node.js runtime
 */
export const hashPasswordAction = action({
  args: {
    password: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    "use node";
    const bcrypt = await import("bcryptjs");
    const saltRounds = 12; // Industry standard for bcrypt
    return await bcrypt.hash(args.password, saltRounds);
  },
});

/**
 * Verify a password against a bcrypt hash
 * This is a Convex action that runs in Node.js runtime
 */
export const verifyPasswordAction = action({
  args: {
    password: v.string(),
    hash: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    "use node";
    const bcrypt = await import("bcryptjs");
    return await bcrypt.compare(args.password, args.hash);
  },
});

// ============================================================================
// Internal Mutations for Session Management
// ============================================================================

/**
 * Create a new session in the database
 */
export const createSession = internalMutation({
  args: {
    adminId: v.id("admins"),
    token: v.string(),
    expiresAt: v.number(),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("sessions", {
      adminId: args.adminId,
      token: args.token,
      expiresAt: args.expiresAt,
      createdAt: now,
      lastAccessedAt: now,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
  },
});

/**
 * Delete a session by token
 */
export const deleteSessionByToken = internalMutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
      return true;
    }
    return false;
  },
});

/**
 * Delete all sessions for an admin (logout all devices)
 */
export const deleteAllAdminSessions = internalMutation({
  args: {
    adminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_admin", (q) => q.eq("adminId", args.adminId))
      .collect();

    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    return sessions.length;
  },
});

/**
 * Update session last accessed time
 */
export const touchSession = internalMutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (session && session.expiresAt > Date.now()) {
      await ctx.db.patch(session._id, {
        lastAccessedAt: Date.now(),
      });
      return true;
    }
    return false;
  },
});

/**
 * Get admin by ID (internal)
 */
export const getAdminById = internalQuery({
  args: {
    adminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.adminId);
  },
});

/**
 * Get admin by email (internal)
 */
export const getAdminByEmailInternal = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
  },
});

/**
 * Update admin's last login time
 */
export const updateLastLogin = internalMutation({
  args: {
    adminId: v.id("admins"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.adminId, {
      updatedAt: Date.now(),
    });
  },
});

/**
 * Create a new admin (internal)
 */
export const createAdmin = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("developer"), v.literal("super_admin"), v.literal("admin")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("admins", {
      email: args.email.toLowerCase(),
      name: args.name,
      passwordHash: args.passwordHash,
      role: args.role,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Get admin count (internal)
 */
export const getAdminCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db.query("admins").collect();
    return admins.length;
  },
});

/**
 * Validate session token (internal)
 * Used by actions to validate authentication
 * Throws an error if the session is invalid
 */
export const validateSessionToken = internalQuery({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.sessionToken) {
      throw new Error("Authentication required: No session token provided");
    }

    // Find session by token
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken!))
      .first();

    if (!session) {
      throw new Error("Invalid session: Session not found");
    }

    // Check if session has expired
    if (session.expiresAt < Date.now()) {
      throw new Error("Session expired: Please log in again");
    }

    // Get admin data
    const admin = await ctx.db.get(session.adminId);
    if (!admin) {
      throw new Error("Invalid session: Admin not found");
    }

    return {
      valid: true,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  },
});

/**
 * Log audit event (internal)
 */
export const logAuditEvent = internalMutation({
  args: {
    action: v.string(),
    adminId: v.optional(v.string()),
    resource: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args: any) => {
    await ctx.db.insert("auditLogs", {
      action: args.action,
      adminId: args.adminId,
      resource: args.resource ?? "auth",
      resourceId: args.resourceId,
      details: args.details,
      createdAt: Date.now(),
    });
  },
});

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Login action - uses bcrypt for password verification
 */
export const login = action({
  args: {
    email: v.string(),
    password: v.string(),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { email, password, userAgent, ipAddress } = args;

    // Find admin by email
    const admin = await ctx.runQuery(internal.auth.auth.getAdminByEmailInternal, {
      email: email.toLowerCase(),
    });

    if (!admin) {
      // Log failed auth attempt
      await ctx.runMutation(internal.auth.auth.logAuditEvent, {
        action: "failed_auth",
        resource: "auth",
        details: "user_not_found",
      });
      throw new Error("Invalid email or password");
    }

    // Verify password using bcrypt
    const isValid = await ctx.runAction(internal.auth.auth.verifyPasswordAction, {
      password,
      hash: admin.passwordHash,
    });

    if (!isValid) {
      // Log failed auth attempt
      await ctx.runMutation(internal.auth.auth.logAuditEvent, {
        action: "failed_auth",
        adminId: admin._id,
        resource: "auth",
        details: "invalid_password",
      });
      throw new Error("Invalid email or password");
    }

    // Update last login
    await ctx.runMutation(internal.auth.auth.updateLastLogin, {
      adminId: admin._id,
    });

    // Generate secure session token
    const sessionToken = generateSessionToken();
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    // Store session in database
    await ctx.runMutation(internal.auth.auth.createSession, {
      adminId: admin._id,
      token: sessionToken,
      expiresAt,
      userAgent,
      ipAddress,
    });

    // Log successful login
    await ctx.runMutation(internal.auth.auth.logAuditEvent, {
      action: "login",
      adminId: admin._id,
      resource: "auth",
      details: admin.name,
    });

    return {
      success: true,
      sessionToken,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  },
});

/**
 * Register action - uses bcrypt for password hashing
 */
export const register = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { email, password, name, userAgent, ipAddress } = args;

    // Check if email already exists
    const existing = await ctx.runQuery(internal.auth.auth.getAdminByEmailInternal, {
      email: email.toLowerCase(),
    });

    if (existing) {
      throw new Error("Email already registered");
    }

    // Hash password using bcrypt
    const passwordHash = await ctx.runAction(internal.auth.auth.hashPasswordAction, {
      password,
    });

    // Check if this is the first admin (make them super_admin)
    const adminCount = await ctx.runQuery(internal.auth.auth.getAdminCount, {});
    const role = adminCount === 0 ? "super_admin" : "admin";

    // Create admin
    const adminId = await ctx.runMutation(internal.auth.auth.createAdmin, {
      email: email.toLowerCase(),
      name,
      passwordHash,
      role,
    });

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    // Store session
    await ctx.runMutation(internal.auth.auth.createSession, {
      adminId,
      token: sessionToken,
      expiresAt,
      userAgent,
      ipAddress,
    });

    // Log registration
    await ctx.runMutation(internal.auth.auth.logAuditEvent, {
      action: "register",
      adminId: adminId,
      resource: "auth",
      details: `role: ${role}`,
    });

    return {
      success: true,
      sessionToken,
      admin: {
        id: adminId,
        email: email.toLowerCase(),
        name,
        role,
      },
    };
  },
});

/**
 * Verify session - validates token against stored sessions
 */
export const verifySession = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { sessionToken } = args;

    if (!sessionToken) {
      return { valid: false, admin: null };
    }

    // Find session by token
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", sessionToken))
      .first();

    if (!session) {
      return { valid: false, admin: null };
    }

    // Check if session has expired
    if (session.expiresAt < Date.now()) {
      return { valid: false, admin: null, expired: true };
    }

    // Get admin data
    const admin = await ctx.db.get(session.adminId);
    if (!admin) {
      return { valid: false, admin: null };
    }

    return {
      valid: true,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  },
});

/**
 * Logout - invalidates the session
 */
export const logout = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { sessionToken } = args;

    // Find and delete the session
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", sessionToken))
      .first();

    if (session) {
      // Log logout
      await ctx.db.insert("auditLogs", {
        timestamp: Date.now(),
        action: "logout",
        userId: session.adminId,
        resourceType: "attendee",
        resourceId: undefined,
        ipAddress: "unknown",
        userAgent: "unknown",
        outcome: "success",
        metadata: {},
      });

      await ctx.db.delete(session._id);
    }

    return { success: true };
  },
});

/**
 * Logout from all devices
 */
export const logoutAll = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const { sessionToken } = args;

    // Find current session to get admin ID
    const currentSession = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", sessionToken))
      .first();

    if (!currentSession) {
      return { success: false, error: "Invalid session" };
    }

    // Delete all sessions for this admin
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_admin", (q) => q.eq("adminId", currentSession.adminId))
      .collect();

    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // Log logout all
    await ctx.db.insert("auditLogs", {
      timestamp: Date.now(),
      action: "logout",
      userId: currentSession.adminId,
      resourceType: "attendee",
      resourceId: undefined,
      ipAddress: "unknown",
      userAgent: "unknown",
      outcome: "success",
      metadata: { action: "logout_all_devices", sessionsCleared: sessions.length },
    });

    return { success: true, sessionsCleared: sessions.length };
  },
});

/**
 * Get current admin by email (for session restoration)
 */
export const getAdminByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (!admin) {
      return null;
    }

    return {
      id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
  },
});

/**
 * Clean up expired sessions (can be called by a cron job)
 */
export const cleanupExpiredSessions = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredSessions = await ctx.db
      .query("sessions")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const session of expiredSessions) {
      await ctx.db.delete(session._id);
    }

    return { cleaned: expiredSessions.length };
  },
});

// Make actions available internally
export const verifyPasswordActionInternal = verifyPasswordAction;
export const hashPasswordActionInternal = hashPasswordAction;
