declare global {
  interface Window {
    __lenis?: { scrollTo: (target: string | number | HTMLElement, opts?: object) => void };
  }
}

/** Smooth-scroll to an element id using Lenis when available, else native. */
export function scrollToId(id: string, offset = -80) {
  const el = document.getElementById(id);
  if (!el) return;
  if (window.__lenis) {
    window.__lenis.scrollTo(el, { offset, duration: 1.1 });
  } else {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export { };
