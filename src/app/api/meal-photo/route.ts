import { NextResponse } from "next/server";
import { hasOpenAiMealEnv } from "@/lib/env";
import { parseMealPhotoWithAi } from "@/lib/meal-ai";
import { mealPhotoRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const result = mealPhotoRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid meal photo request." },
      { status: 400 },
    );
  }

  if (!hasOpenAiMealEnv()) {
    return NextResponse.json(
      { error: "Photo meal analysis is unavailable right now." },
      { status: 503 },
    );
  }

  try {
    const parsed = await parseMealPhotoWithAi(
      result.data.imageDataUrl,
      result.data.mealType,
      result.data.hintText,
    );

    return NextResponse.json({
      ...parsed,
      source: "ai-photo",
    });
  } catch (error) {
    console.error("AI meal photo analysis failed.", error);

    return NextResponse.json(
      { error: "We couldn't understand that meal photo yet." },
      { status: 500 },
    );
  }
}
