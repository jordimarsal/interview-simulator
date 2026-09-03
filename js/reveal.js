/* =========================================================================
   VERBATIM · Interactions (shared)
   - Reveal elements as they enter the viewport (progressive enhancement).
   - Sticky nav gains a "scrolled" state for backdrop/border.
   - Magnetic spotlight: buttons carry a light that follows the cursor.
   Everything degrades gracefully with no dependencies.
   ========================================================================= */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function initReveal() {
    const els = document.querySelectorAll(".reveal");
    if (!els.length) return;
    if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
      }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
      els.forEach(function (el) { io.observe(el); });
    } else {
      els.forEach(function (el) { el.classList.add("in"); });
    }
  }

  function initNavScroll() {
    const nav = document.getElementById("nav") || document.getElementById("topbar");
    if (!nav) return;
    const onScroll = function () { nav.classList.toggle("scrolled", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* Magnetic spotlight for interactive surfaces */
  function initMagnetics() {
    const targets = document.querySelectorAll(".btn, .icon-btn, .mic-btn");
    targets.forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        el.style.setProperty("--mx", x + "%");
        el.style.setProperty("--my", y + "%");
      });
    });
  }

  ready(function () { initReveal(); initNavScroll(); initMagnetics(); });
})();
