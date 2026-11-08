"use client";

import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * Small adapter so the components keep their `to / params / search` call style
 * while running on the Next.js App Router.
 */
type Search = Record<string, string | number | boolean | undefined>;
type Target = { to: string; params?: Record<string, string>; search?: Search };

export function hrefOf({ to, params, search }: Target): string {
  let path = to;
  for (const [key, value] of Object.entries(params ?? {})) path = path.replace(`$${key}`, encodeURIComponent(value));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value !== undefined && value !== false) query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

type LinkProps = Target &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    activeProps?: { className?: string };
    activeOptions?: { exact?: boolean; includeSearch?: boolean };
    children?: ReactNode;
  };

export function Link({ to, params, search, activeProps, activeOptions, className, children, ...rest }: LinkProps) {
  const pathname = usePathname();
  const href = hrefOf({ to, params, search });
  const target = hrefOf({ to, params });
  const active = activeProps
    ? activeOptions?.exact
      ? pathname === target
      : pathname === target || pathname.startsWith(`${target}/`)
    : false;
  return (
    <NextLink href={href} className={active ? (activeProps?.className ?? className) : className} {...rest}>
      {children}
    </NextLink>
  );
}

export function useNavigate() {
  const router = useRouter();
  return async (target: Target) => {
    router.push(hrefOf(target));
  };
}
