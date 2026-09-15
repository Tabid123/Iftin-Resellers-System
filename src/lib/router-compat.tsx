/**
 * Thin compatibility layer that exposes a react-router-dom-like API on top of
 * TanStack Router, so the imported page/component code can stay unchanged.
 */
import {
  Link as TSLink,
  Outlet,
  useLocation as useTSLocation,
  useNavigate as useTSNavigate,
  useParams as useTSParams,
  useRouter,
} from "@tanstack/react-router";
import * as React from "react";

import { getNavIntent, setNavIntent } from "@/lib/navIntent";
import { tenantPathPrefix, withTenantPrefix } from "@/lib/tenant-basepath";

export { Outlet };

type NavOptions = { replace?: boolean; state?: unknown };

export function useNavigate() {
  const navigate = useTSNavigate();
  const router = useRouter();
  const loc = useTSLocation();

  return React.useCallback(
    (to: string | number, options?: NavOptions) => {
      if (typeof to === "number") {
        if (to < 0) router.history.back();
        else if (to > 0) router.history.forward();
        return;
      }
      const [rawPathname, search] = to.split("?");
      const pathname = withTenantPrefix(rawPathname, loc.pathname);
      setNavIntent(rawPathname || pathname, options?.state);
      navigate({
        to: pathname as never,
        search: search ? (Object.fromEntries(new URLSearchParams(search)) as never) : undefined,
        replace: options?.replace,
        state: options?.state as never,
      });
    },
    [navigate, router, loc.pathname],
  );
}

export function useParams<T extends Record<string, string> = Record<string, string>>() {
  return useTSParams({ strict: false } as never) as T;
}

export function useLocation() {
  const loc = useTSLocation();
  const prefix = tenantPathPrefix(loc.pathname);
  const pathname = prefix ? loc.pathname.slice(prefix.length) || "/" : loc.pathname;
  const routerState = (loc.state ?? {}) as unknown as Record<string, unknown>;
  const intent = getNavIntent(pathname);
  const state = intent ? { ...intent, ...routerState } : routerState;
  return {
    pathname,
    search: loc.searchStr ? (loc.searchStr.startsWith("?") ? loc.searchStr : `?${loc.searchStr}`) : "",
    hash: loc.hash ?? "",
    state: state as any,
    key: loc.href,
  };
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>) => void] {
  const loc = useTSLocation();
  const navigate = useNavigate();
  const params = React.useMemo(() => new URLSearchParams(loc.searchStr ?? ""), [loc.searchStr]);
  const setParams = React.useCallback(
    (next: URLSearchParams | Record<string, string>) => {
      const sp = next instanceof URLSearchParams ? next : new URLSearchParams(next);
      const qs = sp.toString();
      navigate(`${loc.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
    },
    [loc.pathname, navigate],
  );
  return [params, setParams];
}

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  replace?: boolean;
  state?: unknown;
  end?: boolean;
};

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, state, end: _end, ...rest },
  ref,
) {
  const loc = useTSLocation();
  const [rawPathname, search] = to.split("?");
  const pathname = withTenantPrefix(rawPathname, loc.pathname);
  return (
    <TSLink
      onClick={() => setNavIntent(rawPathname || pathname, state)}
      ref={ref}
      to={pathname as never}
      search={search ? (Object.fromEntries(new URLSearchParams(search)) as never) : undefined}
      replace={replace}
      state={state as never}
      {...rest}
    />
  );
});

type NavLinkProps = Omit<LinkProps, "className" | "children"> & {
  className?: string | ((props: { isActive: boolean }) => string);
  children?: React.ReactNode | ((props: { isActive: boolean }) => React.ReactNode);
};

export function NavLink({ to, className, children, end, ...rest }: NavLinkProps) {
  const loc = useLocation();
  const target = to.split("?")[0];
  const isActive = end ? loc.pathname === target : loc.pathname === target || loc.pathname.startsWith(`${target}/`);
  return (
    <Link
      to={to}
      className={typeof className === "function" ? className({ isActive }) : className}
      {...rest}
    >
      {typeof children === "function" ? children({ isActive }) : children}
    </Link>
  );
}

export function Navigate({ to, replace = true }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  React.useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}
