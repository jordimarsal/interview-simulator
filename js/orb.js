/* =========================================================================
   VERBATIM · Orb visualizer
   A single self-contained generative surface. It never depends on network
   or audio-graph plumbing; instead each interview state maps to a distinct
   visual personality (idle / agent-speaking / listening / thinking). Events
   ("ripples") inject intentional beats so the orb feels like it is reacting
   to the conversation, not just looping.
   ========================================================================= */
(function () {
  "use strict";

  const PALETTES = {
    idle:     { core: "#F6C35A", ring: "rgba(246,195,90,", energy: 0.10, spin: 0.10 },
    agent:    { core: "#F6C35A", ring: "rgba(246,195,90,", energy: 0.55, spin: 0.35 },
    listening:{ core: "#6FE3D0", ring: "rgba(111,227,208,", energy: 0.85, spin: -0.25 },
    thinking: { core: "#F6C35A", ring: "rgba(246,195,90,", energy: 0.30, spin: 0.18 },
    done:     { core: "#7CE08B", ring: "rgba(124,224,139,", energy: 0.12, spin: 0.05 }
  };

  function Orb(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W = canvas.width, H = canvas.height;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let mode = "idle";
    let targetEnergy = 0.1, energy = 0.1;
    let phase = 0, spin = 0.1;
    const ripples = [];
    const N = 140;                 // spokes around the ring
    const spokes = [];
    for (let i = 0; i < N; i++) spokes.push({ a: Math.random() * 0.4 + 0.1, p: Math.random() * Math.PI * 2 });
    let lastRipple = 0;

    function fit() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const size = rect.width || 300;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      W = canvas.width; H = canvas.height;
    }

    function paletteFor(m) { return PALETTES[m] || PALETTES.idle; }

    this.setMode = function (m) {
      mode = m || "idle";
      const p = paletteFor(mode);
      targetEnergy = p.energy; spin = p.spin;
      canvas.parentElement && (canvas.parentElement.dataset.mode = mode);
    };
    this.ripple = function (color) {
      ripples.push({ r: 0.15, opacity: 1, color: color || PALETTES[mode].core });
    };
    this.breathe = function () { ripples.push({ r: 0.1, opacity: 0.8, color: "#fff" }); };

    function draw(t) {
      energy += (targetEnergy - energy) * 0.05;
      phase += 0.016 * (Math.abs(spin) || 0.2);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const baseR = Math.min(W, H) * 0.30;

      // ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += 0.012; rp.opacity -= 0.014;
        if (rp.opacity <= 0) { ripples.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.strokeStyle = hexA(rp.color, rp.opacity * 0.5);
        ctx.lineWidth = 2 * dpr;
        ctx.arc(cx, cy, baseR * rp.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // waveform ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(phase * spin * 0.1);
      const amp = baseR * 0.02 * (0.4 + energy);
      ctx.lineCap = "round";
      for (let i = 0; i < N; i++) {
        const s = spokes[i];
        const w = Math.sin(phase * 2 + s.p) * amp * s.a +
                  Math.cos(phase * 0.7 + s.p * 1.3) * amp * 0.5 * energy;
        const len = baseR * 0.10 + Math.abs(w) * 3 + energy * baseR * 0.35;
        const ang = (i / N) * Math.PI * 2;
        const x1 = Math.cos(ang) * (baseR - len);
        const y1 = Math.sin(ang) * (baseR - len);
        const x2 = Math.cos(ang) * (baseR + len);
        const y2 = Math.sin(ang) * (baseR + len);
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, hexA(PALETTES[mode].ring, 0.15));
        g.addColorStop(0.5, hexA(PALETTES[mode].ring, 0.4 + energy * 0.4));
        g.addColorStop(1, hexA(PALETTES[mode].ring, 0.15));
        ctx.strokeStyle = g;
        ctx.lineWidth = (2 + energy * 3) * dpr;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      // subtle core halo on canvas (the DOM .core div also glows)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR);
      grad.addColorStop(0, hexA(PALETTES[mode].ring, 0.10 + energy * 0.15));
      grad.addColorStop(1, hexA(PALETTES[mode].ring, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
      ctx.fill();

      if (mode === "agent" && t - lastRipple > 2600) { lastRipple = t; this.ripple(); }
    }

    function loop(t) { draw(t); requestAnimationFrame(loop); }
    fit();
    requestAnimationFrame(loop);
    window.addEventListener("resize", fit);
    return this;
  }

  function hexA(hex, a) {
    // rgba() strings already; pass through, else parse hex
    if (/^rgba?\(/.test(hex)) return hex.replace(/[\d.]+\)$/, a + ")");
    return hex;
  }

  window.Orb = Orb;
})();
