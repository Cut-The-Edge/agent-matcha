"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { FunctionReference, OptionalRestArgs } from "convex/server";
import { useAuth, dispatchAuthError } from "@/components/providers/auth-provider";
import { useEffect } from "react";

/**
 * Custom hook that wraps useQuery and automatically adds sessionToken
 *
 * Usage:
 * ```tsx
 * // Before:
 * const events = useQuery(api.events.list, {});
 *
 * // After:
 * const events = useAuthQuery(api.events.list, {});
 *
 * // Skip the query:
 * const events = useAuthQuery(api.events.list, "skip");
 * ```
 */
export function useAuthQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: Omit<Query["_args"], "sessionToken"> & { sessionToken?: string } | "skip"
): Query["_returnType"] | undefined {
  const { sessionToken, isLoading } = useAuth();

  // If caller explicitly passes "skip", honor that
  const callerSkip = args === "skip";

  // Add sessionToken to args if authenticated and not skipping
  const argsWithToken = !callerSkip && sessionToken
    ? { ...(args as object), sessionToken }
    : args;

  // Skip query if:
  // 1. Caller explicitly passed "skip"
  // 2. Auth is still loading (prevents flash of errors)
  // 3. No session token (user not authenticated - will be redirected by useRequireAuth)
  const shouldSkip = callerSkip || isLoading || !sessionToken;

  const result = useQuery(
    query,
    shouldSkip ? "skip" : argsWithToken as any
  );

  // Handle auth errors
  useEffect(() => {
    if (result === undefined && !isLoading && !sessionToken && !callerSkip) {
      // No session token and query failed - likely needs auth
      console.log("[AuthQuery] No session token available");
    }
  }, [result, isLoading, sessionToken, callerSkip]);

  return result;
}

/**
 * Custom hook that wraps useMutation and provides a helper to add sessionToken
 *
 * Usage:
 * ```tsx
 * // Before:
 * const createEvent = useMutation(api.events.create);
 * await createEvent({ name: "Event" });
 *
 * // After:
 * const { mutate: createEvent, mutateWithAuth } = useAuthMutation(api.events.create);
 * await mutateWithAuth({ name: "Event" }); // sessionToken added automatically
 * ```
 */
export function useAuthMutation<Mutation extends FunctionReference<"mutation">>(
  mutation: Mutation
) {
  const { sessionToken } = useAuth();
  const mutate = useMutation(mutation);

  const mutateWithAuth = async (
    args: Omit<Mutation["_args"], "sessionToken">
  ): Promise<Mutation["_returnType"]> => {
    try {
      return await mutate({ ...args, sessionToken } as any);
    } catch (error) {
      // Check if it's an auth error
      if (
        error instanceof Error &&
        (error.message.includes("No session token") ||
          error.message.includes("Authentication required") ||
          error.message.includes("Invalid session"))
      ) {
        dispatchAuthError();
        throw error;
      }
      throw error;
    }
  };

  return {
    mutate,
    mutateWithAuth,
    sessionToken,
  };
}

/**
 * Custom hook that wraps useAction and provides a helper to add sessionToken
 *
 * Usage:
 * ```tsx
 * const { action: sendMessage, actionWithAuth } = useAuthAction(api.messages.send);
 * await actionWithAuth({ content: "Hello" }); // sessionToken added automatically
 * ```
 */
export function useAuthAction<Action extends FunctionReference<"action">>(
  action: Action
) {
  const { sessionToken } = useAuth();
  const actionFn = useAction(action);

  const actionWithAuth = async (
    args: Omit<Action["_args"], "sessionToken">
  ): Promise<Action["_returnType"]> => {
    try {
      return await actionFn({ ...args, sessionToken } as any);
    } catch (error) {
      // Check if it's an auth error
      if (
        error instanceof Error &&
        (error.message.includes("No session token") ||
          error.message.includes("Authentication required") ||
          error.message.includes("Invalid session"))
      ) {
        dispatchAuthError();
        throw error;
      }
      throw error;
    }
  };

  return {
    action: actionFn,
    actionWithAuth,
    sessionToken,
  };
}
