import { NextResponse } from "next/server";
import { answerCoachQuestionWithAi } from "@/lib/coach-ai";
import { hasOpenAiCoachEnv } from "@/lib/env";
import { coachRequestSchema } from "@/lib/validation";
import type { DietFitState } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json();
  const result = coachRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid coach request." },
      { status: 400 },
    );
  }

  if (!hasOpenAiCoachEnv()) {
    return NextResponse.json(
      { error: "Coach AI is unavailable right now." },
      { status: 503 },
    );
  }

  try {
    const answer = await answerCoachQuestionWithAi({
      question: result.data.question,
      includeContext: result.data.includeContext,
      media: result.data.media,
      previousMessages: result.data.previousMessages,
      state: result.data.state as DietFitState,
    });

    return NextResponse.json({
      answer,
      source: "ai-coach",
    });
  } catch (error) {
    console.error("AI coach answer failed.", error);

    return NextResponse.json(
      { error: "Coach could not answer that yet." },
      { status: 500 },
    );
  }
}
