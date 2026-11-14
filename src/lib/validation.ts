import { z } from "zod";

export const onboardingSchema = z.object({
  name: z.string().min(2, "Please fill required details."),
  age: z.number().min(13).max(80),
  sex: z.enum(["female", "male", "non-binary", "prefer-not-to-say"]),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(35).max(250),
  goalTargetKg: z.number().min(0).max(30).optional(),
  goalDurationMonths: z.number().min(0.5).max(24).optional(),
  motivationAnchor: z.string().optional(),
  exerciseFrequency: z.string().min(1),
  fitnessExperience: z.enum(["beginner", "returning", "intermediate", "advanced"]),
  commitmentLevel: z.enum(["need-a-push", "steady", "locked-in"]),
  primaryGoal: z.enum([
    "lose-weight",
    "maintain",
    "build-muscle",
    "improve-endurance",
    "target-body-area",
    "competition-prep",
  ]),
  secondaryFocus: z.string().min(2),
  workoutEnvironment: z.enum(["home", "gym"]),
  preferredWorkoutDays: z.number().min(2).max(6),
  preferredWorkoutTime: z.string().min(2),
  equipmentAccess: z.array(z.string()),
  injuries: z.array(z.string()),
  // Optional so profiles predating the diet screen still validate; the parsed
  // output is what reaches the store, so an absent key here would be stripped.
  dietaryPreference: z
    .enum(["vegetarian", "vegan", "eggetarian", "non-vegetarian"])
    .optional(),
  foodFlags: z
    .object({
      eatsMeat: z.boolean(),
      eatsDairy: z.boolean(),
      // Older stored profiles predate the eggs split — derive it from
      // eatsMeat so a meat eater keeps seeing eggs, and a vegetarian
      // does not retroactively get flipped on.
      eatsEggs: z.boolean().optional(),
    })
    .transform((flags) => ({
      ...flags,
      eatsEggs: flags.eatsEggs ?? flags.eatsMeat,
    })),
  allergies: z.array(z.string()),
  dislikedFoods: z.array(z.string()),
});

export const mealRequestSchema = z.object({
  rawText: z.string().min(3),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
});

export const mealPhotoRequestSchema = z.object({
  imageDataUrl: z.string().refine((value) => value.startsWith("data:image/"), {
    message: "Invalid image input.",
  }),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  hintText: z.string().trim().max(200).optional(),
});

export const coachRequestSchema = z.object({
  question: z.string().trim().min(1).max(1200),
  includeContext: z.boolean().optional(),
  state: z.unknown(),
  previousMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(2400),
      }),
    )
    .max(12)
    .optional(),
  media: z
    .object({
      name: z.string().max(180),
      type: z.enum(["image", "video"]),
      url: z
        .string()
        .max(8_000_000)
        .refine(
          (value) => value.startsWith("data:image/") || value.startsWith("data:video/"),
          { message: "Invalid media input." },
        ),
    })
    .optional()
    .nullable(),
});
