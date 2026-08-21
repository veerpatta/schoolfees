import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globals = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/**
 * Every animation the mobile v2 design specifies must exist, and — with one
 * deliberate exception — must stop when the reader asks for reduced motion.
 *
 * The design collapses to ten keyframes. Several map onto one of ours rather
 * than getting a duplicate: `scr-in`, `card-in` and `sheet-up` are all
 * "translate up + fade", which is `slide-up`. Only genuinely distinct motion
 * earns its own keyframe — `toast-in` qualifies because it rises 18px from
 * off the bottom edge rather than slide-up's 8px settle.
 *
 * (`roller` is defined in the prototype and used by nothing in it, so it is
 * deliberately absent here rather than ported as dead CSS.)
 */
describe("mobile v2 animation spec", () => {
  const required = [
    "fade-in",
    "slide-up",
    "print-out",
    "stamp-in",
    "check-halo",
    "check-draw",
    "pulse-dot",
    "toast-in",
  ];

  it("defines every keyframe the design calls for", () => {
    for (const name of required) {
      expect(globals, `@keyframes ${name} is missing`).toContain(`@keyframes ${name}`);
    }
  });

  it("keeps motion cheap — transform and opacity only", () => {
    // The design's own rule: "no shadow or layout tweening, so scrolling stays
    // at full frame rate". A keyframe animating width/height/top/box-shadow
    // would force layout or paint on every frame.
    const blocks = globals.match(/@keyframes [a-z-]+ \{[^}]*\{[^}]*\}[^}]*\}/g) ?? [];
    const banned = /\b(width|height|top|left|right|bottom|box-shadow|margin|padding)\s*:/;
    const offenders = blocks
      .filter((block) => banned.test(block.replace(/stroke-dashoffset[^;]*;?/g, "")))
      .map((block) => block.slice(0, 60));

    expect(offenders, `these keyframes animate layout or paint:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it("silences every animation under reduced motion", () => {
    const reduced = globals.slice(globals.indexOf("@media (prefers-reduced-motion: reduce)"));
    const block = reduced.slice(0, reduced.indexOf("animation: none !important"));

    // The pulsing connection dot is the app's only infinite loop, so it is the
    // one that MUST be listed — an indefinite pulse is precisely what this
    // preference exists to stop.
    expect(block).toContain(".anim-pulse-dot");
    expect(block).toContain(".anim-print-out");
    expect(block).toContain(".anim-stamp-in");
    expect(block).toContain(".anim-toast-in");
  });

  it("animates every phone screen and hero card on mount", () => {
    // The design opens 23 of its 24 screens with `scr-in` and lands the hero
    // card behind it. Doing that once in the kit — rather than per screen —
    // is what keeps it from being applied to two screens and forgotten on
    // the rest, which is the state this replaced.
    const kit = readFileSync(
      join(process.cwd(), "src/ui/mobile/mobile-kit.tsx"),
      "utf8",
    );
    const screen = kit.slice(kit.indexOf("export function MobileScreen"));
    expect(screen.slice(0, 400)).toContain("anim-slide-up");

    const ink = kit.slice(kit.indexOf("export function InkCard"));
    expect(ink.slice(0, 700)).toContain("anim-settle-in");
  });

  it("keeps the connection dot honest rather than decorative", () => {
    const pill = readFileSync(
      join(process.cwd(), "src/ui/mobile/connection-pill.tsx"),
      "utf8",
    );
    // A hard-coded "Online" would be a lie the moment the office drops Wi-Fi.
    expect(pill).toContain("navigator.onLine");
    expect(pill).toContain('window.addEventListener("offline"');
  });
});
