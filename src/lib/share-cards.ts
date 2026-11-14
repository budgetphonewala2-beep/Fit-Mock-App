import {
  STREAK_MILESTONE_COPY,
  streakTierFor,
  type StreakTier,
} from "@/lib/streak-milestones";

/**
 * Every celebration that offers a share renders through here, so the images
 * that land in WhatsApp / Instagram / Messages read as one family: same
 * 1080×1920 story frame, same medallion, same wordmark placement. Only the
 * palette, pill and headline change per subject.
 */

const CARD_W = 1080;
const CARD_H = 1920;

type Fonts = { display: string; body: string };

/* ─────────────────────────── shared canvas ──────────────────────────── */

/**
 * next/font/google mangles the family name it applies, so referencing
 * "Archivo" directly in canvas would silently fall back to a system serif.
 * Read the resolved family off a probe element so the card gets the app's
 * real display + body faces.
 */
function resolveAppFonts(): Fonts {
  if (typeof document === "undefined") {
    return { display: "system-ui, sans-serif", body: "system-ui, sans-serif" };
  }
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:absolute;left:-9999px;top:-9999px;visibility:hidden;font-family:var(--font-space-grotesk),system-ui,sans-serif;";
  document.body.appendChild(probe);
  const display = getComputedStyle(probe).fontFamily || "system-ui, sans-serif";
  probe.style.fontFamily = "var(--font-manrope),system-ui,sans-serif";
  const body = getComputedStyle(probe).fontFamily || "system-ui, sans-serif";
  document.body.removeChild(probe);
  return { display, body };
}

/** Convert a CSS value (var(--foo), hex, rgba(), named) to a concrete color. */
function resolveCssColor(value: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = value.trim();
  if (v.startsWith("var(")) {
    const inside = v.slice(4, -1);
    const name = inside.split(",")[0]!.trim();
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return resolved || fallback;
  }
  return v || fallback;
}

/** Blend a color toward black by `t` (0 = source, 1 = black). */
function darken(hex: string, t: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = Math.round(((int >> 16) & 0xff) * (1 - t));
  const g = Math.round(((int >> 8) & 0xff) * (1 - t));
  const b = Math.round((int & 0xff) * (1 - t));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Turn `#rrggbb` into an rgba() string with the given alpha. */
function withAlpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type GlyphKind = "flame" | "star" | "check" | "dumbbell" | "trophy" | "comeback";

const GLYPH_PATHS: Record<GlyphKind, string> = {
  flame:
    "M12 2c.6 3.2-1.2 4.6-2.6 6C7.8 9.6 6 11.2 6 14a6 6 0 0 0 12 0c0-2.4-1.1-4-2.3-5.4-.5 1-1.2 1.7-2 2 .6-2.6-.4-6.3-1.7-8.6Z",
  star:
    "m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z",
  check:
    "M20 6 9 17l-5-5",
  dumbbell:
    "M6.5 6.5v11m11-11v11M3 9v6m18-6v6M6.5 12h11",
  trophy:
    "M8 21h8m-4-4v4M6 4h12v4a6 6 0 0 1-12 0V4Zm0 2H4a2 2 0 0 0 2 2m12-2h2a2 2 0 0 1-2 2",
  // The comeback screen's return arc: a near-full circle with its arrowhead.
  comeback:
    "M20.5 12a8.5 8.5 0 11-4.6-7.56M15.4 1.1l1.1 4.2-4.2 1",
};

// Glyphs drawn as open lines; filling them turns a tick into a wedge.
const LINE_GLYPHS = new Set<GlyphKind>(["check", "dumbbell", "trophy", "comeback"]);

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  kind: GlyphKind,
  cx: number,
  cy: number,
  size: number,
  color: string,
  strokeMode = false,
  lineWidth = 2,
) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  const p = new Path2D(GLYPH_PATHS[kind]);
  if (strokeMode) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(p);
  } else {
    ctx.fillStyle = color;
    ctx.fill(p);
  }
  ctx.restore();
}

/* ────────────────────────── shared card frame ───────────────────────── */

type Stage = {
  stageTop: string;
  stageBottom: string;
  warmGlow: string;
  coolGlow: string;
};

function drawStage(ctx: CanvasRenderingContext2D, stage: Stage) {
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, stage.stageTop);
  bg.addColorStop(1, stage.stageBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const warm = ctx.createRadialGradient(
    CARD_W / 2, CARD_H * 1.05, 0,
    CARD_W / 2, CARD_H * 1.05, CARD_W,
  );
  warm.addColorStop(0, stage.warmGlow);
  warm.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const cool = ctx.createRadialGradient(
    CARD_W / 2, -CARD_H * 0.05, 0,
    CARD_W / 2, -CARD_H * 0.05, CARD_W * 1.1,
  );
  cool.addColorStop(0, stage.coolGlow);
  cool.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cool;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const vign = ctx.createRadialGradient(
    CARD_W / 2, CARD_H * 0.42, CARD_W * 0.35,
    CARD_W / 2, CARD_H * 0.42, CARD_W * 0.95,
  );
  vign.addColorStop(0, "rgba(0,0,0,0)");
  vign.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

const PAD_X = Math.round(CARD_W * 0.07);
const PAD_Y = Math.round(CARD_W * 0.10);

type PillTheme = {
  fill: string;
  border: string;
  ink: string;
  label: string;
  glyph: GlyphKind;
};

type Signature = {
  /** Uppercased in the caps sig line; empty string omits the name half. */
  userName: string;
  /** Freeform right-hand half, e.g. "24 SEP · DAY 100". */
  detail: string;
};

/**
 * Load the real Fitmonk lockup once per session -- a transparent PNG designed
 * to sit on dark grounds (mint mark + cream "Fit" + orange "monk"). Same
 * origin, so the canvas that consumes it never taints.
 */
let logoImagePromise: Promise<HTMLImageElement> | null = null;
function loadFitmonkLockup(): Promise<HTMLImageElement> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("logo requires a browser"));
  }
  if (!logoImagePromise) {
    logoImagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("logo load failed"));
      img.src = "/fitmonk-lockup-on-dark.png";
    });
  }
  return logoImagePromise;
}

function drawTopRow(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  pill: PillTheme,
  signature: Signature,
  ink: string,
) {
  const pillH = Math.round(CARD_W * 0.058);
  const labelSize = Math.round(pillH * 0.44);
  ctx.font = `700 ${labelSize}px ${fonts.body}`;
  ctx.textBaseline = "middle";
  const labelWidth = ctx.measureText(pill.label).width;
  const glyphSize = Math.round(pillH * 0.55);
  const pillPadX = Math.round(pillH * 0.42);
  const pillGap = Math.round(pillH * 0.24);
  const pillW = pillPadX + glyphSize + pillGap + labelWidth + pillPadX;
  const pillY = PAD_Y;

  ctx.save();
  ctx.fillStyle = pill.fill;
  ctx.strokeStyle = pill.border;
  ctx.lineWidth = 2;
  roundedRect(ctx, PAD_X, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const glyphCx = PAD_X + pillPadX + glyphSize / 2;
  const glyphCy = pillY + pillH / 2;
  drawGlyph(ctx, pill.glyph, glyphCx, glyphCy, glyphSize, pill.ink, LINE_GLYPHS.has(pill.glyph), 2.6);

  ctx.font = `700 ${labelSize}px ${fonts.body}`;
  ctx.fillStyle = pill.ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(pill.label, glyphCx + glyphSize / 2 + pillGap, glyphCy + Math.round(labelSize * 0.06));

  // Personal signature on the right — "BHASKAR · 24 SEP" style. Same visual
  // height as the pill, small-caps letterspaced, low-key next to the pill so
  // the card feels signed rather than badged.
  const sigParts = [signature.userName.toUpperCase(), signature.detail].filter(
    (part) => part.length > 0,
  );
  if (sigParts.length === 0) return;

  const sigText = sigParts.join(" · ");
  const sigSize = Math.round(pillH * 0.44);
  ctx.font = `700 ${sigSize}px ${fonts.body}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.78;
  const prevSpacing = (ctx as unknown as { letterSpacing?: string }).letterSpacing;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(sigSize * 0.14)}px`;
  ctx.fillText(sigText, CARD_W - PAD_X, pillY + pillH / 2);
  (ctx as unknown as { letterSpacing: string }).letterSpacing =
    prevSpacing ?? "normal";
  ctx.globalAlpha = 1;
}

type MedallionTheme = {
  /** stops for the linear (150°) fill; two-stop or three-stop */
  stops: string[];
  /** ink for text inside the medallion */
  ink: string;
  /** number of concentric rings around the medallion */
  rings: 2 | 3;
};

const MED_CX = CARD_W / 2;
const MED_CY = CARD_H * 0.52;
const MED_R = Math.round(CARD_W * 0.28);

function drawMedallion(
  ctx: CanvasRenderingContext2D,
  theme: MedallionTheme,
) {
  const ringSpacings = theme.rings === 3 ? [42, 92, 144] : [42, 92];
  const ringAlphas = theme.rings === 3 ? [0.16, 0.10, 0.06] : [0.16, 0.10];
  ctx.save();
  ctx.lineWidth = 2;
  ringSpacings.forEach((spacing, i) => {
    ctx.strokeStyle = `rgba(255,255,255,${ringAlphas[i]})`;
    ctx.beginPath();
    ctx.arc(MED_CX, MED_CY, MED_R + spacing, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();

  // Drop shadow.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.beginPath();
  ctx.arc(MED_CX, MED_CY, MED_R, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();

  // Fill.
  ctx.save();
  const angle = (150 * Math.PI) / 180;
  const dx = Math.cos(angle) * MED_R;
  const dy = Math.sin(angle) * MED_R;
  const grad = ctx.createLinearGradient(MED_CX - dx, MED_CY - dy, MED_CX + dx, MED_CY + dy);
  const stops = theme.stops;
  if (stops.length === 3) {
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(0.55, stops[1]);
    grad.addColorStop(1, stops[2]);
  } else if (stops.length === 2) {
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[1]);
  } else {
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[0]);
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(MED_CX, MED_CY, MED_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Highlight + shade for volume.
  ctx.save();
  ctx.beginPath();
  ctx.arc(MED_CX, MED_CY, MED_R, 0, Math.PI * 2);
  ctx.clip();
  const hi = ctx.createRadialGradient(
    MED_CX, MED_CY - MED_R * 0.55, 0,
    MED_CX, MED_CY - MED_R * 0.55, MED_R * 1.1,
  );
  hi.addColorStop(0, "rgba(255,255,255,0.38)");
  hi.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hi;
  ctx.fillRect(MED_CX - MED_R, MED_CY - MED_R, MED_R * 2, MED_R * 2);
  const lo = ctx.createRadialGradient(
    MED_CX, MED_CY + MED_R * 0.6, 0,
    MED_CX, MED_CY + MED_R * 0.6, MED_R,
  );
  lo.addColorStop(0, "rgba(0,0,0,0.24)");
  lo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lo;
  ctx.fillRect(MED_CX - MED_R, MED_CY - MED_R, MED_R * 2, MED_R * 2);
  ctx.restore();
}

function drawMedallionNumber(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  value: string,
  ink: string,
) {
  const digits = value.length;
  const numSize =
    digits >= 3
      ? Math.round(MED_R * 0.85)
      : digits === 2
        ? Math.round(MED_R * 1.05)
        : Math.round(MED_R * 1.20);
  ctx.font = `900 ${numSize}px ${fonts.display}`;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(value, MED_CX, MED_CY + Math.round(numSize * 0.05));
}

/** A stroked icon in place of a number, for moments that carry no count. */
function drawMedallionGlyph(
  ctx: CanvasRenderingContext2D,
  kind: GlyphKind,
  ink: string,
) {
  drawGlyph(ctx, kind, MED_CX, MED_CY, Math.round(MED_R * 1.05), ink, true, 2.6);
}

/** Number + tiny caption below it, for "45 MIN" style medallions. */
function drawMedallionNumberWithCaption(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  value: string,
  caption: string,
  ink: string,
) {
  const digits = value.length;
  const numSize =
    digits >= 3
      ? Math.round(MED_R * 0.75)
      : digits === 2
        ? Math.round(MED_R * 0.95)
        : Math.round(MED_R * 1.10);
  const capSize = Math.round(MED_R * 0.16);
  ctx.font = `900 ${numSize}px ${fonts.display}`;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(value, MED_CX, MED_CY - Math.round(capSize * 0.5));

  ctx.font = `800 ${capSize}px ${fonts.body}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(caption, MED_CX, MED_CY + Math.round(numSize * 0.5) - Math.round(capSize * 0.1));
  ctx.globalAlpha = 1;
}

/**
 * Draws the headline centred in the band between the pill row and the top of
 * the medallion's outer ring. Smaller than the old bottom-left treatment on
 * purpose — from feedback, the heavier bottom-left type was fighting the
 * logo for space; a centred eyebrow above the medallion reads as the
 * subtitle to the number rather than a competing element.
 */
function drawHeadline(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  headline: string,
  ink: string,
) {
  const lines = headline.split("\n");
  const size = Math.round(CARD_W * 0.058);
  const lineH = Math.round(size * 1.05);
  ctx.font = `900 ${size}px ${fonts.display}`;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Anchor at the mid-point of the space above the medallion, then stack
  // lines around it so 1- and 2-line headlines both look balanced.
  const bandTop = PAD_Y + Math.round(CARD_W * 0.058) + Math.round(CARD_W * 0.02);
  const bandBottom = MED_CY - MED_R - Math.round(CARD_W * 0.11);
  const bandCentre = (bandTop + bandBottom) / 2;
  const totalH = lines.length * lineH;
  const firstBaseline = bandCentre - totalH / 2 + lineH * 0.85;
  lines.forEach((line, i) => {
    ctx.fillText(line, CARD_W / 2, firstBaseline + i * lineH);
  });
}

/**
 * Bottom-right lockup — pixel-accurate from the handoff PNG.
 */
function drawBottomLogo(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
) {
  if (!logo) return;
  const logoW = Math.round(CARD_W * 0.30);
  const logoH = Math.round(logoW * (logo.height / logo.width));
  ctx.drawImage(
    logo,
    CARD_W - PAD_X - logoW,
    CARD_H - PAD_Y - logoH,
    logoW,
    logoH,
  );
}

async function makeCanvas() {
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready.catch(() => null);
  }
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  const logo = await loadFitmonkLockup().catch(() => null);
  return { canvas, ctx, fonts: resolveAppFonts(), logo };
}

/** Format 2026-09-24 (or a Date) as "24 SEP" for the signature line. */
function formatShortDate(isoOrDate: string | Date | undefined): string {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getMonth()];
  return `${day} ${month}`;
}

/** Shared personalization: name + a right-hand detail line ("BHASKAR · 24 SEP"). */
export type ShareCardSignature = {
  userName?: string;
  /** ISO date or Date; defaults to today. Pass "" to omit the date. */
  achievedOn?: string | Date;
  /** Extra tag appended after the date, e.g. "DAY 100". */
  detail?: string;
};

function signatureFrom({ userName, achievedOn, detail }: ShareCardSignature): Signature {
  const parts: string[] = [];
  if (achievedOn !== "") {
    const d = formatShortDate(achievedOn);
    if (d) parts.push(d);
  }
  if (detail) parts.push(detail);
  return { userName: userName ?? "", detail: parts.join(" · ") };
}

/* ─────────────────────────── streak card ────────────────────────────── */

function streakStage(tier: StreakTier): Stage {
  if (tier === "elite") {
    return {
      stageTop: "#0F3E35",
      stageBottom: "#061E1B",
      warmGlow: "rgba(55,201,166,0.66)",
      coolGlow: "rgba(255,210,74,0.42)",
    };
  }
  if (tier === "gold") {
    return {
      stageTop: "#143C33",
      stageBottom: "#0A2A24",
      warmGlow: "rgba(255,210,74,0.60)",
      coolGlow: "rgba(55,201,166,0.35)",
    };
  }
  return {
    stageTop: "#143C33",
    stageBottom: "#0A2A24",
    warmGlow: tier === "ember" ? "rgba(242,132,58,0.60)" : "rgba(242,132,58,0.55)",
    coolGlow: "rgba(55,201,166,0.42)",
  };
}

function streakMedallion(tier: StreakTier): MedallionTheme {
  if (tier === "elite") {
    return {
      stops: ["#37C9A6", "#0E9E86", "#FFD24A"],
      ink: "#06231E",
      rings: 3,
    };
  }
  if (tier === "gold") {
    return {
      stops: ["#FFD24A", "#F2843A"],
      ink: "#12201D",
      rings: 3,
    };
  }
  return { stops: ["#FFB03A", "#E2612B"], ink: "#12201D", rings: 2 };
}

function streakPill(tier: StreakTier): PillTheme {
  if (tier === "elite") {
    return {
      fill: "rgba(55,201,166,0.14)",
      border: "rgba(55,201,166,0.32)",
      ink: "#B7EBD9",
      label: "ELITE",
      glyph: "star",
    };
  }
  if (tier === "gold") {
    return {
      fill: "rgba(255,255,255,0.09)",
      border: "rgba(255,255,255,0.16)",
      ink: "#F9D680",
      label: "GOLD",
      glyph: "flame",
    };
  }
  return {
    fill: "rgba(255,255,255,0.09)",
    border: "rgba(255,255,255,0.16)",
    ink: "#F9AF6B",
    label: tier === "ember" ? "EMBER" : "SPARK",
    glyph: "flame",
  };
}

export type StreakShareCardInput = {
  days: number;
  headline?: string;
} & ShareCardSignature;

export async function renderStreakShareCard({
  days,
  headline,
  userName,
  achievedOn,
  detail,
}: StreakShareCardInput): Promise<string> {
  const tier = streakTierFor(days);
  const copy = STREAK_MILESTONE_COPY[days];
  const headText = headline ?? copy?.headline ?? `${days} day streak`;
  const { canvas, ctx, fonts, logo } = await makeCanvas();
  const INK = "#F5EFDF";
  const sig = signatureFrom({
    userName,
    achievedOn,
    detail: detail ?? `DAY ${days}`,
  });

  drawStage(ctx, streakStage(tier));
  drawTopRow(ctx, fonts, streakPill(tier), sig, INK);
  drawMedallion(ctx, streakMedallion(tier));
  drawMedallionNumber(ctx, fonts, String(days), streakMedallion(tier).ink);
  drawHeadline(ctx, fonts, headText, INK); drawBottomLogo(ctx, logo);

  return canvas.toDataURL("image/jpeg", 0.90);
}

/* ────────────────────────── challenge card ──────────────────────────── */

export type ChallengeShareCardInput = {
  /** Challenge title, e.g. "30-Day Protein". */
  title: string;
  /** Days completed (the payoff — usually === durationDays). */
  completedDays: number;
  /** Accent color; accepts hex, rgb(), or a var(--foo) string. */
  color: string;
  /** Icon to place inside the pill. */
  glyph?: GlyphKind;
} & ShareCardSignature;

/**
 * A 30-day challenge is a different moment than a 30-day streak — the palette
 * is the challenge's own color, and the medallion carries the total rather
 * than a day-count that resets. Anatomy stays identical to the streak card.
 */
export async function renderChallengeShareCard({
  title,
  completedDays,
  color,
  glyph = "trophy",
  userName,
  achievedOn,
  detail,
}: ChallengeShareCardInput): Promise<string> {
  const accent = resolveCssColor(color, "#F2843A");
  const accentDark = darken(accent, 0.55);
  const { canvas, ctx, fonts, logo } = await makeCanvas();
  const INK = "#F5EFDF";
  const sig = signatureFrom({ userName, achievedOn, detail });

  drawStage(ctx, {
    stageTop: "#143C33",
    stageBottom: "#0A2A24",
    warmGlow: withAlpha(accent, 0.55),
    coolGlow: "rgba(55,201,166,0.32)",
  });

  drawTopRow(
    ctx,
    fonts,
    {
      fill: withAlpha(accent, 0.14),
      border: withAlpha(accent, 0.34),
      ink: accent,
      label: "CHALLENGE",
      glyph,
    },
    sig,
    INK,
  );

  drawMedallion(ctx, {
    stops: [accent, accentDark],
    ink: INK,
    rings: 3,
  });
  drawMedallionNumber(ctx, fonts, String(completedDays), INK);

  // Two-line headline: split at the natural break in "30-Day Protein" style
  // titles, or on the first space past the halfway mark for longer ones.
  const headline = splitTitleForHeadline(title);
  drawHeadline(ctx, fonts, headline, INK); drawBottomLogo(ctx, logo);

  return canvas.toDataURL("image/jpeg", 0.90);
}

function splitTitleForHeadline(title: string): string {
  // Prefer a break after the number-day prefix ("21-Day Meal Streak" → "21-Day\nMeal Streak").
  const dayMatch = /^(\d+-Day)\s+(.+)$/i.exec(title);
  if (dayMatch) return `${dayMatch[1]}\n${dayMatch[2]}`;
  // Otherwise pick the space nearest the middle.
  if (title.length < 18) return title;
  const midpoint = Math.floor(title.length / 2);
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < title.length; i++) {
    if (title[i] === " ") {
      const dist = Math.abs(i - midpoint);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
  }
  if (bestIdx === -1) return title;
  return `${title.slice(0, bestIdx)}\n${title.slice(bestIdx + 1)}`;
}

/* ───────────────────────── nutrition-day card ───────────────────────── */

export type NutritionDayShareCardInput = {
  /** Grams of protein hit today, shown as the medallion number. */
  proteinG: number;
} & ShareCardSignature;

/**
 * Daily "protein + hydration both hit" card. Uses the brand mint palette to
 * distinguish it from workout (also mint but with a duration medallion) and
 * from the streak/challenge tiers.
 */
export async function renderNutritionDayShareCard({
  proteinG,
  userName,
  achievedOn,
  detail,
}: NutritionDayShareCardInput): Promise<string> {
  const { canvas, ctx, fonts, logo } = await makeCanvas();
  const INK = "#F5EFDF";
  const sig = signatureFrom({ userName, achievedOn, detail });

  drawStage(ctx, {
    stageTop: "#0F3E35",
    stageBottom: "#061E1B",
    warmGlow: "rgba(55,201,166,0.60)",
    coolGlow: "rgba(127,227,201,0.38)",
  });

  drawTopRow(
    ctx,
    fonts,
    {
      fill: "rgba(127,227,201,0.16)",
      border: "rgba(127,227,201,0.34)",
      ink: "#B7EBD9",
      label: "NUTRITION",
      glyph: "check",
    },
    sig,
    INK,
  );

  drawMedallion(ctx, {
    stops: ["#7FE3C9", "#0E9E86"],
    ink: "#06231E",
    rings: 3,
  });
  drawMedallionNumberWithCaption(
    ctx,
    fonts,
    `${Math.round(proteinG)}`,
    "G PROTEIN",
    "#06231E",
  );

  drawHeadline(ctx, fonts, "Congrats on hitting your\nprotein goal today!", INK);
  drawBottomLogo(ctx, logo);

  return canvas.toDataURL("image/jpeg", 0.90);
}

/* ────────────────────────── workout card ────────────────────────────── */

export type WorkoutShareCardInput = {
  /** Duration in minutes. */
  minutes: number;
} & ShareCardSignature;

/**
 * Workout complete card: brand-teal palette across the board — no per-session
 * variation, because a session isn't a milestone or a challenge, it's just a
 * clean win worth showing. Headline is a fixed "Congrats" line rather than
 * the session name; the friend receiving the share cares about the fact of
 * the session, not what specifically was in it.
 */
export async function renderWorkoutShareCard({
  minutes,
  userName,
  achievedOn,
  detail,
}: WorkoutShareCardInput): Promise<string> {
  const { canvas, ctx, fonts, logo } = await makeCanvas();
  const INK = "#F5EFDF";
  const sig = signatureFrom({ userName, achievedOn, detail });

  drawStage(ctx, {
    stageTop: "#0F3E35",
    stageBottom: "#061E1B",
    warmGlow: "rgba(55,201,166,0.60)",
    coolGlow: "rgba(255,210,74,0.28)",
  });

  drawTopRow(
    ctx,
    fonts,
    {
      fill: "rgba(55,201,166,0.14)",
      border: "rgba(55,201,166,0.32)",
      ink: "#B7EBD9",
      label: "WORKOUT DONE",
      glyph: "dumbbell",
    },
    sig,
    INK,
  );

  drawMedallion(ctx, {
    stops: ["#5CD7B9", "#0E9E86"],
    ink: "#06231E",
    rings: 2,
  });
  drawMedallionNumberWithCaption(ctx, fonts, String(minutes), "MIN", "#06231E");

  drawHeadline(ctx, fonts, "Congrats for finishing\nyour workout session!", INK);
  drawBottomLogo(ctx, logo);

  return canvas.toDataURL("image/jpeg", 0.90);
}

/* ────────────────────────── first-meal card ─────────────────────────── */

export type FirstMealShareCardInput = {
  /** Calories in the meal; the medallion shows a tick instead when omitted. */
  kcal?: number;
  /** "Day 1 streak started" style line under the headline. */
  streakLabel: string;
} & ShareCardSignature;

/**
 * The first-meal takeover as a story: same mint tick medallion and teal stage
 * with an orange glow as the screen itself. The medallion carries the meal's
 * calories when we trust the parse, otherwise the tick, so a shaky estimate
 * never ends up on someone's story.
 */
export async function renderFirstMealShareCard({
  kcal,
  streakLabel,
  userName,
  achievedOn,
  detail,
}: FirstMealShareCardInput): Promise<string> {
  const { canvas, ctx, fonts, logo } = await makeCanvas();
  const INK = "#F5EFDF";
  const MED_INK = "#07302C";
  const sig = signatureFrom({ userName, achievedOn, detail });

  drawStage(ctx, {
    stageTop: "#143C33",
    stageBottom: "#0A2A24",
    warmGlow: "rgba(242,132,58,0.50)",
    coolGlow: "rgba(55,201,166,0.48)",
  });

  drawTopRow(
    ctx,
    fonts,
    {
      fill: "rgba(55,201,166,0.14)",
      border: "rgba(55,201,166,0.42)",
      ink: "#B7EBD9",
      label: "FIRST MEAL",
      glyph: "check",
    },
    sig,
    INK,
  );

  drawMedallion(ctx, { stops: ["#37C9A6", "#1B8F73"], ink: MED_INK, rings: 3 });
  if (kcal && kcal > 0) {
    drawMedallionNumberWithCaption(ctx, fonts, String(Math.round(kcal)), "KCAL", MED_INK);
  } else {
    drawMedallionGlyph(ctx, "check", MED_INK);
  }

  drawHeadline(ctx, fonts, `First meal logged.\n${streakLabel}.`, INK);
  drawBottomLogo(ctx, logo);

  return canvas.toDataURL("image/jpeg", 0.90);
}

/* ─────────────────────────── comeback card ──────────────────────────── */

/**
 * The comeback takeover as a story. Like the screen, it shows no numbers (no
 * "N days away"): the return arc is the hero, mint rather than the streak
 * orange, with only a faint warm glow.
 */
export async function renderComebackShareCard({
  userName,
  achievedOn,
  detail,
}: ShareCardSignature): Promise<string> {
  const { canvas, ctx, fonts, logo } = await makeCanvas();
  const INK = "#F5EFDF";
  const sig = signatureFrom({ userName, achievedOn, detail });

  drawStage(ctx, {
    stageTop: "#0F3E35",
    stageBottom: "#061E1B",
    warmGlow: "rgba(242,132,58,0.26)",
    coolGlow: "rgba(55,201,166,0.48)",
  });

  drawTopRow(
    ctx,
    fonts,
    {
      fill: "rgba(55,201,166,0.16)",
      border: "rgba(55,201,166,0.50)",
      ink: "#B7EBD9",
      label: "WELCOME BACK",
      glyph: "comeback",
    },
    sig,
    INK,
  );

  drawMedallion(ctx, { stops: ["#5CD7B9", "#0E9E86"], ink: "#06231E", rings: 2 });
  drawMedallionGlyph(ctx, "comeback", "#06231E");

  drawHeadline(ctx, fonts, "Back on track.\nNothing was reset.", INK);
  drawBottomLogo(ctx, logo);

  return canvas.toDataURL("image/jpeg", 0.90);
}
