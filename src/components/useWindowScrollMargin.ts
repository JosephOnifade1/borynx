"use client";

import { useCallback, useState } from "react";

/** Measure the list in window coordinates after it is mounted, not during render. */
export function useWindowScrollMargin() {
  const [scrollMargin, setScrollMargin] = useState(0);
  const listRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setScrollMargin(node.getBoundingClientRect().top + window.scrollY);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return { listRef, scrollMargin };
}
