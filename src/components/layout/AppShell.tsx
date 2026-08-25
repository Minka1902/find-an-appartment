"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListChecks, Map, Users } from "lucide-react";

import { cn } from "@/lib/cn";
import { HouseholdImportPrompt } from "./HouseholdImportPrompt";

/**
 * The single place the compact/wide layout regime is decided.
 *
 * Compact (<lg): a bottom tab bar, thumb-reachable, above the safe area.
 * Wide (>=lg): a slim left rail, so the full width goes to the map.
 *
 * Both are pure CSS so the correct chrome is present before hydration.
 */

const NAV = [
  { href: "/setup", label: "Setup", icon: Home },
  { href: "/map", label: "Map", icon: Map },
  { href: "/shortlist", label: "Shortlist", icon: ListChecks },
  { href: "/household", label: "Household", icon: Users },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-[100dvh] w-full flex-col lg:flex-row">
      {/* Visible only on focus. Without it, reaching the map means tabbing
          through the whole nav on every navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      {/* Wide: persistent left rail. Hidden entirely on compact. */}
      <nav
        aria-label="Main"
        className={cn(
          "hidden shrink-0 border-r border-border-subtle",
          "bg-surface-raised lg:flex lg:w-[92px] lg:flex-col lg:items-center lg:gap-1 lg:py-4",
        )}
      >
        <span className="mb-4 px-2 text-center text-[11px] leading-tight font-semibold tracking-tight text-ink-muted">
          Where
          <br />
          To Live
        </span>

        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-[76px] flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-medium transition-colors",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
              )}
            >
              <Icon size={20} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* `min-h-0` lets a full-height child (the map) shrink instead of
          overflowing the flex container. */}
      <main id="main" className="min-h-0 min-w-0 flex-1">
        {children}
      </main>

      {/* Lives in the shell so a shared link works whichever screen it points
          at, not just the one the invite happens to use today. */}
      <HouseholdImportPrompt />

      {/* Compact: bottom tab bar, padded for the home indicator. */}
      <nav
        // Named distinctly from the rail above. Only one of the two is ever
        // exposed — `display: none` takes the other out of the accessibility
        // tree — so this is insurance rather than a fix: if either is ever
        // hidden by something that doesn't remove it from the tree, two
        // landmarks called "Main" become indistinguishable in a landmark list.
        aria-label="Main, bottom bar"
        className={cn(
          "flex shrink-0 border-t border-border-subtle",
          "bg-surface-raised pb-[env(safe-area-inset-bottom)] lg:hidden",
        )}
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "touch-target flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-accent" : "text-ink-muted",
              )}
            >
              <Icon size={20} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
