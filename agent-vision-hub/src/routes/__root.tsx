import {
  Outlet, Link, createRootRoute,
  useNavigate, useRouterState,
} from "@tanstack/react-router";
import { ThemeProvider } from "@/components/ThemeProvider";
import { loadAuth } from "@/lib/storage";
import { useEffect } from "react";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/auth"];

/**
 * AuthGuard — runs on every route change.
 * Redirects unauthenticated visitors to /auth.
 */
function AuthGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate  = useNavigate();

  useEffect(() => {
    const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
    if (!isPublic && !loadAuth()) {
      navigate({ to: "/auth" });
    }
  }, [pathname, navigate]);

  return null;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        <div className="mt-6">
          <Link to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  return (
    <ThemeProvider>
      <AuthGuard />
      <Outlet />
    </ThemeProvider>
  );
}
