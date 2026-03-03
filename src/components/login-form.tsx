"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAction } from "convex/react"
import { api } from "../../convex/_generated/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function parseErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Authentication failed"
  }

  const message = err.message

  const uncaughtMatch = message.match(/Uncaught Error:\s*(.+?)(?:\s+at\s+|$)/i)
  if (uncaughtMatch) {
    return uncaughtMatch[1].trim()
  }

  const errorMatch = message.match(/Error:\s*(.+?)(?:\s+at\s+|\[|$)/i)
  if (errorMatch) {
    return errorMatch[1].trim()
  }

  if (!message.includes("[CONVEX")) {
    return message
  }

  return "Authentication failed"
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [name, setName] = useState("")

  const login = useAction(api.auth.auth.login)
  const register = useAction(api.auth.auth.register)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters")
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        throw new Error("Invalid email format")
      }

      let result;

      if (isRegisterMode) {
        if (!name.trim()) {
          throw new Error("Name is required")
        }
        result = await register({
          email: email.toLowerCase(),
          password,
          name: name.trim(),
        })
      } else {
        result = await login({
          email: email.toLowerCase(),
          password,
        })
      }

      const sessionData = {
        email: result.admin.email,
        name: result.admin.name,
        role: result.admin.role,
        adminId: result.admin.id,
        sessionToken: result.sessionToken,
        timestamp: Date.now(),
      }

      const encodedSession = btoa(JSON.stringify(sessionData))

      const secureFlag = window.location.protocol === 'https:' ? 'Secure;' : ''
      document.cookie = `auth-token=${encodeURIComponent(encodedSession)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax; ${secureFlag}`

      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      setError(parseErrorMessage(err))
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a
              href="/"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
                AM
              </div>
              <span className="sr-only">Agent Matcha</span>
            </a>
            <h1 className="text-xl font-bold">
              {isRegisterMode ? "Create Account" : "Welcome to Agent Matcha"}
            </h1>
            <FieldDescription>
              {isRegisterMode
                ? "Set up your admin account"
                : "Sign in to manage your matchmaking"}
            </FieldDescription>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {isRegisterMode && (
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete={isRegisterMode ? "new-password" : "current-password"}
              minLength={8}
            />
            {isRegisterMode && (
              <FieldDescription className="text-xs">
                Minimum 8 characters
              </FieldDescription>
            )}
          </Field>

          <Field>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading
                ? isRegisterMode
                  ? "Creating account..."
                  : "Signing in..."
                : isRegisterMode
                  ? "Create Account"
                  : "Sign in"}
            </Button>
          </Field>

          <FieldSeparator>Or</FieldSeparator>

          <Field>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode)
                setError(null)
              }}
              disabled={isLoading}
            >
              {isRegisterMode
                ? "Already have an account? Sign in"
                : "Create new account"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center text-xs">
        By signing in, you agree to our{" "}
        <a href="#" className="underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="#" className="underline">
          Privacy Policy
        </a>
        .
      </FieldDescription>
    </div>
  )
}
