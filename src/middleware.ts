import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Routes that require authentication
const protectedRoutes = ["/dashboard"]

// Routes that should redirect to dashboard if already authenticated
const authRoutes = ["/login"]

// Validate session token structure
function isValidSession(token: string | undefined): boolean {
  if (!token) return false

  try {
    const decoded = JSON.parse(atob(decodeURIComponent(token)))
    // Check required fields exist and session has Convex adminId
    return !!(
      decoded.email &&
      decoded.adminId &&
      decoded.sessionToken &&
      decoded.timestamp &&
      // Session not older than 30 days
      Date.now() - decoded.timestamp < 30 * 24 * 60 * 60 * 1000
    )
  } catch {
    return false
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check for auth token in cookies and validate structure
  const authToken = request.cookies.get("auth-token")?.value
  const isAuthenticated = isValidSession(authToken)

  // Check if accessing a protected route
  const isProtectedRoute = protectedRoutes.some(route =>
    pathname.startsWith(route)
  )

  // Check if accessing an auth route (login, register)
  const isAuthRoute = authRoutes.some(route =>
    pathname === route || pathname.startsWith(route)
  )

  // Redirect to login if accessing protected route without auth
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    const response = NextResponse.redirect(loginUrl)
    // Clear invalid cookie if it exists but is invalid
    if (authToken && !isAuthenticated) {
      response.cookies.delete("auth-token")
    }
    return response
  }

  // Redirect to dashboard if accessing auth route while authenticated
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - api routes
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api|.*\\..*$).*)",
  ],
}
