import { NextResponse } from "next/server";
import { hasOpenAiMealEnv } from "@/lib/env";
import { parseMealTextWithAi } from "@/lib/meal-ai";
import { parseMealText } from "@/lib/meal-parser";
import { mealRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const result = mealRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid meal request." },
      { status: 400 },
    );
  }

  if (hasOpenAiMealEnv()) {
    try {
      const parsed = await parseMealTextWithAi(result.data.rawText, result.data.mealType);

      return NextResponse.json({
        ...parsed,
        source: "ai-assisted",
      });
    } catch (error) {
      console.error("AI meal parsing failed; falling back to rules parser.", error);
    }
  }

  const parsed = parseMealText(result.data.rawText, result.data.mealType);

  return NextResponse.json({
    ...parsed,
    source: "rules-ready",
  });
}
