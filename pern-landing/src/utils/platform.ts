import { useEffect, useState } from "react";
import { contactEmail } from "../data/content";

export const platformHref = "./app.html";

export const platformFallbackHref = `mailto:${contactEmail}?subject=${encodeURIComponent(
  "Access Request — PERN Platform"
)}`;

export function usePlatformAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    fetch(platformHref, { method: "HEAD", cache: "no-store", signal: controller.signal })
      .then((res) => {
        if (alive) setAvailable(res.ok);
      })
      .catch(() => {
        // Network error / timeout: keep the same-origin app as the default
        // rather than degrading to the fallback on a transient probe failure.
      })
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return {
    available,
    /** Resolve to the same-origin platform unless it is definitively unreachable. */
    resolve: (): string => (available === false ? platformFallbackHref : platformHref),
  };
}
