"use client";

import React, { Suspense, useEffect, useRef, useState, useTransition, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

function RouteChangeListener({ onPathChange }: { onPathChange: (path: string) => void }) {
  const pathname = usePathname();
  useEffect(() => {
    onPathChange(pathname);
  }, [pathname, onPathChange]);
  return null;
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);
  const [, startTransition] = useTransition();
  // Pending delayed navigation; non-null while a fade-out is in flight so repeat clicks are ignored
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePathChange = useCallback(() => {
    setIsExiting(false);
  }, []);

  // With cacheComponents, the page we leave is hidden (not unmounted) and keeps its state.
  // Reset it on hide so returning to it fades in cleanly instead of replaying the fade-out first.
  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
      setIsExiting(false);
    };
  }, []);

  // Intercept local internal anchor link clicks to fade out current page before route transition
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      // Don't intercept if modifier keys were held or event was already handled
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if target is an internal anchor
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Skip external links, hashes, mailto, tel, downloads, or new tabs
      if (
        href.startsWith("http:") ||
        href.startsWith("https:") ||
        href.startsWith("//") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      // Skip if navigating to identical path
      const currentUrl = window.location.pathname + window.location.search;
      if (href === currentUrl || href === window.location.pathname) {
        return;
      }

      // Fade out current page to nothing first
      e.preventDefault();
      if (navTimerRef.current) return; // a navigation is already fading out
      setIsExiting(true);

      navTimerRef.current = setTimeout(() => {
        navTimerRef.current = null;
        startTransition(() => {
          router.push(href);
        });
      }, 160);
    };

    document.addEventListener("click", handleLinkClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleLinkClick, { capture: true });
    };
  }, [router]);

  return (
    <div
      className={`min-h-full flex-1 flex flex-col ${
        isExiting ? "animate-page-fade-out pointer-events-none" : "animate-page-fade-in"
      }`}
    >
      <Suspense fallback={null}>
        <RouteChangeListener onPathChange={handlePathChange} />
      </Suspense>
      {children}
    </div>
  );
}

