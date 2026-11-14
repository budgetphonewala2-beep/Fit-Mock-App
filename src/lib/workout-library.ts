import { getOpenAiCoachModel } from "@/lib/env";

export type WorkoutLibraryMuscle =
  | "back"
  | "biceps"
  | "chest"
  | "core"
  | "legs"
  | "shoulders"
  | "triceps";

export type WorkoutLibraryItem = {
  exerciseId: string;
  title: string;
  type: string;
  reps: string;
  target: string;
  equipment: string;
  guidance: string;
  muscle: WorkoutLibraryMuscle;
};

function makeId(title: string) {
  return `lib-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function build(
  muscle: WorkoutLibraryMuscle,
  rows: Array<[string, string, string, string, string]>,
): WorkoutLibraryItem[] {
  // rows: [title, reps, target, equipment, guidance]
  return rows.map(([title, reps, target, equipment, guidance]) => ({
    exerciseId: makeId(title),
    title,
    type: "strength",
    reps,
    target,
    equipment,
    guidance,
    muscle,
  }));
}

/**
 * Curated fallback library of 125+ exercises across every focus group.
 * This guarantees the picker always has a full catalog even when the AI
 * service is unavailable. When OpenAI is configured the route augments
 * this list with model-generated suggestions.
 */
export const WORKOUT_LIBRARY: WorkoutLibraryItem[] = [
  ...build("chest", [
    ["Barbell Bench Press", "4 x 8", "Chest", "Barbell, bench", "Drive your feet into the floor and press in a straight bar path."],
    ["Incline Barbell Bench Press", "4 x 8", "Upper chest", "Barbell, incline bench", "Keep shoulder blades pinned and press toward the upper chest."],
    ["Decline Barbell Bench Press", "3 x 10", "Lower chest", "Barbell, decline bench", "Lower with control and press up through the lower chest."],
    ["Incline Dumbbell Press", "3 x 10", "Upper chest", "Dumbbells, bench", "Tuck the elbows slightly and pause lightly at the bottom."],
    ["Flat Dumbbell Press", "4 x 10", "Chest", "Dumbbells, bench", "Press the dumbbells together at the top for a strong squeeze."],
    ["Dumbbell Flyes", "3 x 12", "Chest stretch", "Dumbbells, bench", "Move in a wide arc with a soft elbow bend."],
    ["Incline Dumbbell Flyes", "3 x 12", "Upper chest", "Dumbbells, incline bench", "Open wide and squeeze the upper chest at the top."],
    ["Machine Chest Press", "3 x 10", "Chest", "Chest press machine", "Sit tall, keep shoulders down, finish without harsh lockout."],
    ["Pec Deck Fly", "3 x 12", "Inner chest", "Pec deck machine", "Lead with the elbows and squeeze at the center."],
    ["Cable Crossover", "3 x 12", "Inner chest", "Cable machine", "Lean slightly forward and squeeze hard at the midline."],
    ["Low to High Cable Fly", "3 x 12", "Upper chest", "Cable machine", "Sweep upward in a wide arc and pause at the top."],
    ["High to Low Cable Fly", "3 x 12", "Lower chest", "Cable machine", "Drive the handles down and in toward your hips."],
    ["Chest Dips", "3 x 10", "Lower chest", "Dip station", "Lean forward, lower to a gentle stretch, press back up."],
    ["Push-Up", "3 x 15", "Chest", "Bodyweight", "Keep a straight line and lower the chest to the floor."],
    ["Incline Push-Up", "3 x 15", "Upper chest", "Bench or box", "Hands elevated for a gentler push-up angle."],
    ["Smith Machine Press", "3 x 10", "Chest", "Smith machine, bench", "Lower to mid chest with a smooth, controlled tempo."],
    ["Svend Press", "3 x 15", "Inner chest", "Weight plate", "Press a plate out straight and squeeze the chest hard."],
    ["Landmine Press", "3 x 12", "Upper chest", "Barbell, landmine", "Press up and slightly in along the bar arc."],
  ]),
  ...build("back", [
    ["Barbell Deadlift", "4 x 6", "Full back", "Barbell", "Hinge at the hips, keep a flat back, drive through your heels."],
    ["Rack Pull", "4 x 6", "Upper back", "Barbell, rack", "Start below the knees and finish tall with lats tight."],
    ["Pull-Up", "3 x 8", "Lats", "Pull-up bar", "Lead with the lats and pull until the chin clears the bar."],
    ["Chin-Up", "3 x 8", "Lats, biceps", "Pull-up bar", "Use an underhand grip and pull the elbows down and back."],
    ["Lat Pulldown", "3 x 10", "Lats", "Cable machine", "Lean slightly back and pull to the upper chest."],
    ["Close-Grip Pulldown", "3 x 10", "Lats", "Cable machine", "Pull with a neutral grip and squeeze the lats."],
    ["Bent-Over Barbell Row", "4 x 8", "Mid back", "Barbell", "Bend to 45 degrees and pull to the lower chest."],
    ["Pendlay Row", "3 x 8", "Mid back", "Barbell", "Pull explosively from the floor and reset each rep."],
    ["T-Bar Row", "4 x 8", "Mid back", "T-bar machine", "Brace the torso and squeeze the upper back hard."],
    ["Seated Cable Row", "3 x 10", "Mid back", "Cable machine", "Sit tall, pull to the navel, control the return."],
    ["Single-Arm Dumbbell Row", "3 x 10", "Lats", "Dumbbell, bench", "Brace on the bench and row to your hip."],
    ["Chest-Supported Row", "3 x 10", "Upper back", "Incline bench, dumbbells", "Drive the elbows back without shrugging."],
    ["Straight-Arm Pulldown", "3 x 12", "Lats", "Cable machine", "Keep arms long and pull through the lats."],
    ["Inverted Row", "3 x 12", "Mid back", "Barbell, rack", "Keep the body rigid and pull the chest to the bar."],
    ["Meadows Row", "3 x 10", "Lats", "Barbell, landmine", "Row from a staggered stance with a hard squeeze."],
    ["Renegade Row", "3 x 10", "Back, core", "Dumbbells", "Hold a plank and row one dumbbell at a time."],
    ["Back Extension", "3 x 15", "Lower back", "Hyperextension bench", "Rise to a straight line without overarching."],
  ]),
  ...build("biceps", [
    ["Barbell Curl", "4 x 10", "Biceps", "Barbell", "Pin the elbows and curl without swinging the torso."],
    ["EZ-Bar Curl", "3 x 10", "Biceps", "EZ bar", "Use the angled grip to keep the wrists comfortable."],
    ["Dumbbell Bicep Curl", "4 x 10", "Biceps", "Dumbbells", "Curl with strict form and squeeze at the top."],
    ["Hammer Curl", "3 x 12", "Brachialis", "Dumbbells", "Keep a neutral grip and squeeze at the top."],
    ["Incline Dumbbell Curl", "3 x 12", "Biceps stretch", "Dumbbells, incline bench", "Let the arms hang back for a deep stretch."],
    ["Concentration Curl", "3 x 12", "Biceps peak", "Dumbbell", "Brace the elbow on the inner thigh and curl strictly."],
    ["Preacher Curl", "3 x 10", "Biceps", "Preacher bench, EZ bar", "Keep the upper arms flat and control the lowering."],
    ["Cable Curl", "3 x 12", "Biceps", "Cable machine", "Keep constant tension through the full curl."],
    ["Spider Curl", "3 x 12", "Biceps peak", "Incline bench, dumbbells", "Curl with the arms hanging straight down."],
    ["Reverse Curl", "3 x 12", "Forearms", "Dumbbells or bar", "Use an overhand grip and keep the wrists steady."],
    ["Zottman Curl", "3 x 12", "Biceps, forearms", "Dumbbells", "Curl up normally and rotate to lower with an overhand grip."],
    ["Cross-Body Hammer Curl", "3 x 12", "Brachialis", "Dumbbells", "Curl across the body toward the opposite shoulder."],
    ["Resistance Band Curl", "3 x 15", "Biceps", "Resistance band", "Stand on the band and keep smooth tension throughout."],
  ]),
  ...build("triceps", [
    ["Close-Grip Bench Press", "4 x 8", "Triceps", "Barbell, bench", "Keep hands shoulder-width and elbows tucked."],
    ["Tricep Dips", "3 x 10", "Triceps", "Dip station", "Stay upright and press up without bouncing."],
    ["Bench Dips", "3 x 12", "Triceps", "Bench", "Lower until the elbows reach 90 degrees and press up."],
    ["Overhead Tricep Extension", "3 x 12", "Long head", "Dumbbell", "Keep the elbows forward and extend fully overhead."],
    ["Cable Overhead Extension", "3 x 12", "Long head", "Cable machine", "Keep the elbows narrow and avoid arching the back."],
    ["Rope Pushdown", "3 x 12", "Lateral head", "Cable machine", "Spread the rope and squeeze at full extension."],
    ["Straight-Bar Pushdown", "3 x 12", "Triceps", "Cable machine", "Lock the elbows to your sides and press down fully."],
    ["Reverse-Grip Pushdown", "3 x 12", "Medial head", "Cable machine", "Use an underhand grip with strict elbow control."],
    ["Skull Crusher", "3 x 10", "Triceps", "EZ bar, bench", "Lower to the forehead, keep the elbows still."],
    ["Dumbbell Kickback", "3 x 12", "Triceps", "Dumbbells", "Lock the upper arm and extend fully behind you."],
    ["Diamond Push-Up", "3 x 12", "Triceps", "Bodyweight", "Form a diamond with the hands and keep elbows close."],
    ["JM Press", "3 x 10", "Triceps", "Barbell, bench", "Lower toward the chin and press with the triceps."],
    ["Single-Arm Pushdown", "3 x 12", "Triceps", "Cable machine", "Keep the elbow pinned and finish each rep fully."],
  ]),
  ...build("shoulders", [
    ["Barbell Overhead Press", "4 x 8", "Shoulders", "Barbell", "Brace the core and press straight overhead."],
    ["Seated Dumbbell Press", "4 x 10", "Shoulders", "Dumbbells, bench", "Press up and in without locking out harshly."],
    ["Arnold Press", "3 x 10", "All delts", "Dumbbells", "Rotate the palms as you press up and reverse on the way down."],
    ["Machine Shoulder Press", "4 x 10", "Shoulders", "Shoulder press machine", "Press smoothly and lower to shoulder height."],
    ["Lateral Raise", "3 x 12", "Side delts", "Dumbbells", "Raise to shoulder height with a slight elbow bend."],
    ["Cable Lateral Raise", "3 x 12", "Side delts", "Cable machine", "Keep tension through the full arc, one arm at a time."],
    ["Front Raise", "3 x 12", "Front delts", "Dumbbells", "Raise to eye level with a controlled tempo."],
    ["Rear Delt Fly", "3 x 12", "Rear delts", "Dumbbells", "Hinge forward and fly the arms wide."],
    ["Reverse Pec Deck", "3 x 15", "Rear delts", "Pec deck machine", "Open the arms wide without shrugging."],
    ["Face Pull", "3 x 15", "Rear delts", "Cable machine", "Pull to the face and flare the elbows out."],
    ["Upright Row", "3 x 12", "Delts, traps", "EZ bar", "Lead with the elbows to shoulder level."],
    ["Barbell Shrug", "4 x 15", "Traps", "Barbell", "Shrug straight up and hold briefly at the top."],
    ["Dumbbell Shrug", "4 x 15", "Traps", "Dumbbells", "Lift the shoulders to the ears without rolling them."],
    ["Landmine Press", "3 x 12", "Shoulders", "Barbell, landmine", "Press up and in along the bar's natural arc."],
  ]),
  ...build("legs", [
    ["Barbell Back Squat", "4 x 8", "Quads", "Barbell, rack", "Brace, sit back and down, and drive through the whole foot."],
    ["Front Squat", "4 x 8", "Quads", "Barbell, rack", "Keep the elbows high and the torso upright."],
    ["Hack Squat", "4 x 8", "Quads", "Hack squat machine", "Stay braced, lower deep, and drive through mid-foot."],
    ["Leg Press", "3 x 12", "Quads", "Leg press machine", "Feet shoulder-width and press without locking the knees."],
    ["Romanian Deadlift", "3 x 10", "Hamstrings", "Barbell", "Push the hips back and feel the hamstring stretch."],
    ["Stiff-Leg Deadlift", "3 x 10", "Hamstrings", "Barbell", "Keep the legs nearly straight and the back flat."],
    ["Walking Lunge", "3 x 12", "Glutes, quads", "Dumbbells", "Step out, drop the back knee, push through the front heel."],
    ["Reverse Lunge", "3 x 12", "Glutes", "Dumbbells", "Step back and lower straight down with control."],
    ["Bulgarian Split Squat", "3 x 10", "Glutes, quads", "Bench, dumbbells", "Lean slightly forward and sink straight down."],
    ["Goblet Squat", "3 x 12", "Quads", "Dumbbell or kettlebell", "Hold the weight at the chest and squat between the knees."],
    ["Leg Extension", "3 x 15", "Quads", "Leg extension machine", "Lift with control and pause at the top."],
    ["Lying Leg Curl", "3 x 12", "Hamstrings", "Leg curl machine", "Curl slowly and control the negative."],
    ["Seated Leg Curl", "3 x 12", "Hamstrings", "Leg curl machine", "Squeeze the hamstrings and avoid using momentum."],
    ["Hip Thrust", "4 x 10", "Glutes", "Barbell, bench", "Keep the ribs down and drive to full hip extension."],
    ["Glute Bridge", "3 x 15", "Glutes", "Bodyweight or barbell", "Press the hips up and squeeze the glutes hard."],
    ["Standing Calf Raise", "4 x 15", "Calves", "Calf raise machine", "Rise fully onto the toes and lower with a stretch."],
    ["Seated Calf Raise", "4 x 15", "Calves", "Seated calf machine", "Pause at the top and stretch fully at the bottom."],
    ["Step-Up", "3 x 12", "Quads, glutes", "Box, dumbbells", "Drive through the lead foot and stand tall."],
  ]),
  ...build("core", [
    ["Plank", "3 x 45 sec", "Core", "Bodyweight", "Hold a straight line and brace the abs tight."],
    ["Side Plank", "3 x 30 sec", "Obliques", "Bodyweight", "Stack the hips and keep a straight line."],
    ["Hanging Leg Raise", "3 x 12", "Lower abs", "Pull-up bar", "Raise the legs to 90 degrees without swinging."],
    ["Hanging Knee Raise", "3 x 12", "Lower abs", "Pull-up bar", "Curl the knees up using the abs and control the descent."],
    ["Cable Crunch", "3 x 15", "Abs", "Cable machine", "Curl the ribs toward the hips and keep tension."],
    ["Cable Woodchop", "3 x 12", "Obliques", "Cable machine", "Rotate from the hips and control the return."],
    ["Russian Twist", "3 x 20", "Obliques", "Dumbbell", "Lean back slightly and rotate side to side."],
    ["Ab Wheel Rollout", "3 x 10", "Core", "Ab wheel", "Roll out with a flat back and pull back with the abs."],
    ["Dead Bug", "3 x 12", "Deep core", "Bodyweight", "Press the lower back down and extend opposite limbs."],
    ["Bicycle Crunch", "3 x 20", "Obliques", "Bodyweight", "Rotate the torso and bring elbow to opposite knee."],
    ["Decline Sit-Up", "3 x 12", "Upper abs", "Decline bench", "Roll up through the spine with control."],
    ["Pallof Press", "3 x 12", "Anti-rotation", "Cable machine", "Brace hard and press straight out without twisting."],
    ["Mountain Climber", "3 x 30 sec", "Core", "Bodyweight", "Drive the knees in fast while holding a plank."],
    ["Toe Touch", "3 x 15", "Upper abs", "Bodyweight", "Reach toward the toes and squeeze the abs."],
    ["Reverse Crunch", "3 x 15", "Lower abs", "Bodyweight", "Curl the hips off the floor and lower slowly."],
    ["Flutter Kick", "3 x 30 sec", "Lower abs", "Bodyweight", "Keep the legs straight and alternate small kicks."],
    ["V-Up", "3 x 15", "Core", "Bodyweight", "Lift the legs and torso to meet over the hips."],
    ["Hollow Hold", "3 x 30 sec", "Core", "Bodyweight", "Press the lower back down and hold a banana shape."],
  ]),
  ...build("chest", [
    ["Resistance Band Chest Press", "3 x 15", "Chest", "Resistance band", "Press the band forward and control the return."],
    ["Plyometric Push-Up", "3 x 8", "Chest", "Bodyweight", "Push explosively so the hands leave the floor."],
    ["Floor Press", "3 x 10", "Chest", "Dumbbells", "Press from the floor with the elbows lightly touching down."],
  ]),
  ...build("back", [
    ["Kettlebell Swing", "3 x 15", "Posterior chain", "Kettlebell", "Hinge hard and snap the hips to float the bell."],
    ["Good Morning", "3 x 12", "Lower back", "Barbell", "Hinge forward with a flat back and return tall."],
    ["Resistance Band Row", "3 x 15", "Back", "Resistance band", "Anchor the band and row both hands to your sides."],
  ]),
  ...build("biceps", [
    ["Drag Curl", "3 x 12", "Biceps", "Barbell", "Drag the bar up the torso keeping elbows back."],
    ["Bayesian Cable Curl", "3 x 12", "Biceps", "Cable machine", "Curl from behind the body for a long-head stretch."],
    ["Waiter Curl", "3 x 15", "Biceps", "Dumbbell", "Cup one dumbbell and curl with the palms up."],
    ["Band Hammer Curl", "3 x 15", "Brachialis", "Resistance band", "Curl with a neutral grip keeping tension high."],
  ]),
  ...build("triceps", [
    ["Tate Press", "3 x 12", "Triceps", "Dumbbells, bench", "Lower the dumbbells toward the chest with elbows flared."],
    ["Bodyweight Skull Crusher", "3 x 12", "Triceps", "Bar, rack", "Lower the head toward a fixed bar and press back."],
    ["Resistance Band Pushdown", "3 x 15", "Triceps", "Resistance band", "Press down and lock the elbows to the sides."],
    ["Close-Grip Push-Up", "3 x 15", "Triceps", "Bodyweight", "Keep the hands narrow and the elbows tucked."],
  ]),
  ...build("shoulders", [
    ["Pike Push-Up", "3 x 10", "Shoulders", "Bodyweight", "Hips high, lower the head toward the floor and press up."],
    ["Band Lateral Raise", "3 x 15", "Side delts", "Resistance band", "Raise to shoulder height keeping tension on the band."],
    ["Plate Front Raise", "3 x 12", "Front delts", "Weight plate", "Raise a plate to eye level with a slow tempo."],
  ]),
  ...build("legs", [
    ["Sumo Deadlift", "4 x 6", "Glutes, quads", "Barbell", "Take a wide stance and drive the floor apart."],
    ["Box Jump", "3 x 8", "Legs, power", "Plyo box", "Land softly with the knees tracking over the toes."],
    ["Sissy Squat", "3 x 12", "Quads", "Bodyweight", "Lean back on the toes and bend at the knees only."],
    ["Nordic Curl", "3 x 8", "Hamstrings", "Pad, anchor", "Lower slowly under control and push back up."],
  ]),
];

function normalizeTitle(title: string) {
  return title.trim().toLowerCase();
}

export function dedupeLibraryItems(items: WorkoutLibraryItem[]): WorkoutLibraryItem[] {
  const seen = new Set<string>();
  const result: WorkoutLibraryItem[] = [];

  for (const item of items) {
    const key = normalizeTitle(item.title);

    if (!item.title.trim() || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

const LIBRARY_MUSCLES: WorkoutLibraryMuscle[] = [
  "back",
  "biceps",
  "chest",
  "core",
  "legs",
  "shoulders",
  "triceps",
];

function isLibraryMuscle(value: unknown): value is WorkoutLibraryMuscle {
  return typeof value === "string" && LIBRARY_MUSCLES.includes(value as WorkoutLibraryMuscle);
}

function getOutputText(responseJson: unknown): string | null {
  if (
    typeof responseJson === "object" &&
    responseJson !== null &&
    "output_text" in responseJson &&
    typeof (responseJson as { output_text: unknown }).output_text === "string"
  ) {
    return (responseJson as { output_text: string }).output_text;
  }

  if (
    typeof responseJson !== "object" ||
    responseJson === null ||
    !("output" in responseJson) ||
    !Array.isArray((responseJson as { output: unknown }).output)
  ) {
    return null;
  }

  for (const outputItem of (responseJson as { output: unknown[] }).output) {
    if (
      typeof outputItem === "object" &&
      outputItem !== null &&
      "content" in outputItem &&
      Array.isArray((outputItem as { content: unknown }).content)
    ) {
      for (const contentItem of (outputItem as { content: unknown[] }).content) {
        if (
          typeof contentItem === "object" &&
          contentItem !== null &&
          "text" in contentItem &&
          typeof (contentItem as { text: unknown }).text === "string"
        ) {
          return (contentItem as { text: string }).text;
        }
      }
    }
  }

  return null;
}

const librarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["exercises"],
  properties: {
    exercises: {
      type: "array",
      minItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "muscle", "reps", "target", "equipment", "guidance"],
        properties: {
          title: { type: "string" },
          muscle: {
            type: "string",
            enum: LIBRARY_MUSCLES,
          },
          reps: { type: "string" },
          target: { type: "string" },
          equipment: { type: "string" },
          guidance: { type: "string" },
        },
      },
    },
  },
} as const;

type AiExerciseRow = {
  title: string;
  muscle: WorkoutLibraryMuscle;
  reps: string;
  target: string;
  equipment: string;
  guidance: string;
};

function parseAiExercises(outputText: string): WorkoutLibraryItem[] {
  const parsed = JSON.parse(outputText) as unknown;

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("exercises" in parsed) ||
    !Array.isArray((parsed as { exercises: unknown }).exercises)
  ) {
    return [];
  }

  const rows = (parsed as { exercises: unknown[] }).exercises;
  const items: WorkoutLibraryItem[] = [];

  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      continue;
    }

    const candidate = row as Partial<AiExerciseRow>;

    if (
      typeof candidate.title !== "string" ||
      !candidate.title.trim() ||
      !isLibraryMuscle(candidate.muscle)
    ) {
      continue;
    }

    items.push({
      exerciseId: makeId(candidate.title),
      title: candidate.title.trim(),
      type: "strength",
      reps: typeof candidate.reps === "string" && candidate.reps.trim() ? candidate.reps.trim() : "3 x 12",
      target: typeof candidate.target === "string" && candidate.target.trim() ? candidate.target.trim() : candidate.muscle,
      equipment:
        typeof candidate.equipment === "string" && candidate.equipment.trim()
          ? candidate.equipment.trim()
          : "Gym",
      guidance:
        typeof candidate.guidance === "string" && candidate.guidance.trim()
          ? candidate.guidance.trim()
          : "Perform with controlled form.",
      muscle: candidate.muscle,
    });
  }

  return items;
}

export async function generateWorkoutLibraryWithAi(): Promise<WorkoutLibraryItem[]> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiCoachModel(),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You generate a broad gym exercise catalog for a fitness app's custom routine builder. Return a diverse list of at least 80 distinct strength exercises spread across all muscle groups (back, biceps, chest, core, legs, shoulders, triceps). Use real, common gym exercise names. Keep guidance to one concise coaching cue. Reps should look like '3 x 12' or '4 x 8' or a time like '3 x 45 sec'.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Generate the exercise catalog. Avoid duplicates and cover every muscle group well.",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "workout_library",
          schema: librarySchema,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI workout library generation failed with status ${response.status}.`);
  }

  const responseJson = (await response.json()) as unknown;
  const outputText = getOutputText(responseJson);

  if (!outputText) {
    throw new Error("OpenAI workout library returned no structured output.");
  }

  return parseAiExercises(outputText);
}
