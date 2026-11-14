"use client";

// Stylized stick-figure loops that stand in for filmed footage on the two
// lead-in steps of the home session player -- the strength library is filmed,
// the openers are illustrated. Five archetypes cover the 14 preset moves; the
// exerciseId picks the archetype. Keyframes live inline in each SVG so the
// component is self-contained (no globals.css edits) and pauses in lockstep
// with the session timer via the `running` prop.

type SessionOpenerArchetype =
  | "kneeling-reach"
  | "arms-both"
  | "arm-featured"
  | "quadruped-flex"
  | "standing-hinge";

// Each of the 28 warm-up slot ids maps to the archetype whose motion best
// carries that move at the stick-figure abstraction. Once a real clip is
// uploaded for a slot, the video takes over and the archetype no longer
// matters. Grouped by focus for readability.
const ARCHETYPE_BY_EXERCISE_ID: Record<string, SessionOpenerArchetype> = {
  // Universal stretch sequence, same before every session: spine → hips → legs
  "stretch-1-preset": "quadruped-flex",
  "stretch-2-preset": "arms-both",
  "stretch-3-preset": "standing-hinge",

  // Back: spine mobility → mid-back activation → rear delt pulls → prone raises
  "warmup-back-1-preset": "quadruped-flex",
  "warmup-back-2-preset": "arms-both",
  "warmup-back-3-preset": "arms-both",
  "warmup-back-4-preset": "kneeling-reach",

  // Biceps: shoulder circles → wrist prep → light curls → slow curls
  "warmup-biceps-1-preset": "arms-both",
  "warmup-biceps-2-preset": "arm-featured",
  // Biceps day borrows chest's Wall Push-Ups + Arm Circles for slots 3 and
  // 4 -- the same R2 clips carry them, so the archetype below only kicks in
  // as a fallback.
  "warmup-biceps-3-preset": "standing-hinge",
  "warmup-biceps-4-preset": "arms-both",

  // Chest: cross-body swings → arm circles → scap push-ups → wall push-ups
  "warmup-chest-1-preset": "arms-both",
  "warmup-chest-2-preset": "arms-both",
  "warmup-chest-3-preset": "quadruped-flex",
  "warmup-chest-4-preset": "standing-hinge",

  // Core: cat-cow → dead bug → bird-dog → plank taps
  "warmup-core-1-preset": "quadruped-flex",
  "warmup-core-2-preset": "kneeling-reach",
  "warmup-core-3-preset": "quadruped-flex",
  "warmup-core-4-preset": "quadruped-flex",

  // Legs: leg swings → glute bridges → squats → walking lunge
  "warmup-legs-1-preset": "standing-hinge",
  "warmup-legs-2-preset": "kneeling-reach",
  "warmup-legs-3-preset": "standing-hinge",
  "warmup-legs-4-preset": "standing-hinge",

  // Shoulders: circles → wall slides → pull-aparts → light press
  "warmup-shoulders-1-preset": "arms-both",
  "warmup-shoulders-2-preset": "arms-both",
  "warmup-shoulders-3-preset": "arms-both",
  "warmup-shoulders-4-preset": "arms-both",

  // Triceps: circles → overhead + elbow circles → close push-ups → pushdowns
  "warmup-triceps-1-preset": "arms-both",
  "warmup-triceps-2-preset": "arm-featured",
  "warmup-triceps-3-preset": "standing-hinge",
  "warmup-triceps-4-preset": "arm-featured",
};

function KneelingReachFigure({ running }: { running: boolean }) {
  const playState = running ? "running" : "paused";

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <style>{`
        @keyframes opener-breath { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
        @keyframes opener-arm-reach { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(6deg); } }
        .kr-body { animation: opener-breath 4.2s ease-in-out infinite; animation-play-state: ${playState}; }
        .kr-arm { transform-origin: 138px 128px; transform-box: view-box; animation: opener-arm-reach 4.2s ease-in-out infinite; animation-play-state: ${playState}; }
      `}</style>
      <line x1="20" y1="172" x2="180" y2="172" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeLinecap="round" />
      <g className="kr-body" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        {/* folded lower leg lying on the ground */}
        <path d="M 100 162 L 58 162" />
        {/* thigh, hip to knee */}
        <path d="M 100 158 L 68 152" />
        {/* torso, hip to shoulder pitched forward */}
        <path d="M 100 155 L 138 128" />
        {/* head */}
        <circle cx="146" cy="120" r="10" />
        {/* extended arm reaching forward */}
        <path className="kr-arm" d="M 138 128 L 182 148" />
      </g>
    </svg>
  );
}

function ArmsBothFigure({ running }: { running: boolean }) {
  const playState = running ? "running" : "paused";

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <style>{`
        @keyframes opener-arm-cw { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes opener-arm-ccw { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        .ab-arm-left { transform-origin: 82px 88px; transform-box: view-box; animation: opener-arm-ccw 3s linear infinite; animation-play-state: ${playState}; }
        .ab-arm-right { transform-origin: 118px 88px; transform-box: view-box; animation: opener-arm-cw 3s linear infinite; animation-play-state: ${playState}; }
      `}</style>
      <line x1="60" y1="182" x2="140" y2="182" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeLinecap="round" />
      <g fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="100" cy="60" r="12" />
        <line x1="100" y1="72" x2="100" y2="140" />
        {/* arms attached at shoulders, rotating opposite directions */}
        <line className="ab-arm-left" x1="82" y1="88" x2="82" y2="130" />
        <line className="ab-arm-right" x1="118" y1="88" x2="118" y2="130" />
        {/* legs */}
        <line x1="100" y1="140" x2="82" y2="180" />
        <line x1="100" y1="140" x2="118" y2="180" />
      </g>
    </svg>
  );
}

function ArmFeaturedFigure({ running }: { running: boolean }) {
  const playState = running ? "running" : "paused";

  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <style>{`
        @keyframes opener-sway { 0%, 100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
        .af-body { transform-origin: 100px 150px; transform-box: view-box; animation: opener-sway 5.4s ease-in-out infinite; animation-play-state: ${playState}; }
      `}</style>
      <line x1="55" y1="182" x2="145" y2="182" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeLinecap="round" />
      <g className="af-body" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="100" cy="55" r="12" />
        <line x1="100" y1="67" x2="100" y2="130" />
        {/* right arm crosses chest from right shoulder to left side */}
        <path d="M 118 78 Q 100 92 78 100" />
        {/* left arm cups the right elbow near mid-chest */}
        <path d="M 82 78 Q 88 92 94 96" />
        {/* legs */}
        <line x1="100" y1="130" x2="88" y2="178" />
        <line x1="100" y1="130" x2="112" y2="178" />
      </g>
    </svg>
  );
}

function QuadrupedFlexFigure({ running }: { running: boolean }) {
  const playState = running ? "running" : "paused";

  // Two spine curves cross-fade: "cow" (belly toward floor) and "cat" (spine
  // rounded up). Cross-fade dodges the compat gaps around animating a path's
  // `d` attribute in CSS across all browsers.
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <style>{`
        @keyframes opener-cow { 0%, 42%, 100% { opacity: 1; } 58%, 92% { opacity: 0; } }
        @keyframes opener-cat { 0%, 42%, 100% { opacity: 0; } 58%, 92% { opacity: 1; } }
        .qf-spine-cow { animation: opener-cow 3.6s ease-in-out infinite; animation-play-state: ${playState}; }
        .qf-spine-cat { animation: opener-cat 3.6s ease-in-out infinite; animation-play-state: ${playState}; }
        @keyframes opener-head-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .qf-head { animation: opener-head-bob 3.6s ease-in-out infinite; animation-play-state: ${playState}; }
      `}</style>
      <line x1="30" y1="168" x2="170" y2="168" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeLinecap="round" />
      <g fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        {/* front arm down to the floor from the shoulders (front end of spine) */}
        <line x1="145" y1="130" x2="150" y2="166" />
        {/* back leg down to the floor from the hips (back end of spine) */}
        <line x1="55" y1="130" x2="52" y2="166" />
        {/* spine crossfade: cow curve (belly-drop, U-shape) */}
        <path className="qf-spine-cow" d="M 55 130 Q 100 148 145 130" />
        {/* cat curve (rounded up, inverted-U) */}
        <path className="qf-spine-cat" d="M 55 130 Q 100 112 145 130" />
        {/* head hanging from the front of the spine; neck bobs with breath */}
        <g className="qf-head">
          <line x1="145" y1="130" x2="158" y2="140" />
          <circle cx="164" cy="146" r="10" />
        </g>
      </g>
    </svg>
  );
}

function StandingHingeFigure({ running }: { running: boolean }) {
  const playState = running ? "running" : "paused";

  // Cross-fade two poses: standing tall vs squat/hinge. Cheaper and clearer
  // than trying to interpolate hip/knee joint angles inline.
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full">
      <style>{`
        @keyframes opener-stand { 0%, 40%, 100% { opacity: 1; } 55%, 95% { opacity: 0; } }
        @keyframes opener-squat { 0%, 40%, 100% { opacity: 0; } 55%, 95% { opacity: 1; } }
        .sh-stand { animation: opener-stand 2.8s ease-in-out infinite; animation-play-state: ${playState}; }
        .sh-squat { animation: opener-squat 2.8s ease-in-out infinite; animation-play-state: ${playState}; }
      `}</style>
      <line x1="55" y1="182" x2="145" y2="182" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeLinecap="round" />
      {/* standing pose */}
      <g className="sh-stand" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="100" cy="52" r="12" />
        <line x1="100" y1="64" x2="100" y2="125" />
        <line x1="100" y1="82" x2="78" y2="112" />
        <line x1="100" y1="82" x2="122" y2="112" />
        <line x1="100" y1="125" x2="86" y2="180" />
        <line x1="100" y1="125" x2="114" y2="180" />
      </g>
      {/* squat/hinge pose: hips low, knees bent, torso pitched slightly */}
      <g className="sh-squat" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="102" cy="72" r="12" />
        <line x1="102" y1="84" x2="108" y2="142" />
        <line x1="102" y1="98" x2="80" y2="126" />
        <line x1="102" y1="98" x2="124" y2="126" />
        {/* thighs pitched forward, then shins vertical to feet on the ground */}
        <line x1="108" y1="142" x2="84" y2="160" />
        <line x1="108" y1="142" x2="132" y2="160" />
        <line x1="84" y1="160" x2="86" y2="180" />
        <line x1="132" y1="160" x2="132" y2="180" />
      </g>
    </svg>
  );
}

export function SessionOpenerFigure({
  exerciseId,
  running,
}: {
  exerciseId: string;
  running: boolean;
}) {
  const archetype = ARCHETYPE_BY_EXERCISE_ID[exerciseId] ?? "arms-both";

  switch (archetype) {
    case "kneeling-reach":
      return <KneelingReachFigure running={running} />;
    case "arms-both":
      return <ArmsBothFigure running={running} />;
    case "arm-featured":
      return <ArmFeaturedFigure running={running} />;
    case "quadruped-flex":
      return <QuadrupedFlexFigure running={running} />;
    case "standing-hinge":
      return <StandingHingeFigure running={running} />;
  }
}
