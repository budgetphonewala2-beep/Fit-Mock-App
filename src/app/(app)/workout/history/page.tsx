"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ChartNoAxesColumnIncreasing, ChevronLeft } from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { Card } from "@/components/ui/card";
import { startOfTodayIso } from "@/lib/utils";
import type { WorkoutLoadLog } from "@/lib/types";

type HistoryPoint = {
  weekIndex: number;
  loadValue: number;
  loadUnit: string;
};

function formatLoadValue(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function normalizeExerciseName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

type WeeklyHistoryLog = {
  weekIndex: number;
  startDate: string;
  endDate: string;
  logs: WorkoutLoadLog[];
  averageLoadValue: number;
  loadUnit: string;
};

function getRelevantWorkoutLoadLogs(
  logs: WorkoutLoadLog[],
  exerciseId: string,
  exerciseName: string,
  sessionDate: string,
  preferredUnit: string,
) {
  const normalizedExerciseName = normalizeExerciseName(exerciseName);
  return logs
    .filter(
      (log) =>
        (log.exerciseId === exerciseId ||
          normalizeExerciseName(log.exerciseName) === normalizedExerciseName) &&
        log.sessionDate <= sessionDate &&
        (!preferredUnit || log.loadUnit === preferredUnit),
    )
    .sort((a, b) =>
      a.sessionDate.localeCompare(b.sessionDate) || a.setNumber - b.setNumber,
    );
}

function buildWeeklyHistoryLogs(relevantLogs: WorkoutLoadLog[]) {
  if (relevantLogs.length === 0) {
    return [] as WeeklyHistoryLog[];
  }

  const startedAt = relevantLogs[0]?.sessionDate ?? startOfTodayIso();
  const logsByWeek = new Map<number, WorkoutLoadLog[]>();

  relevantLogs.forEach((log) => {
    const weekIndex =
      Math.floor(
        differenceInCalendarDays(
          parseISO(log.sessionDate),
          parseISO(startedAt),
        ) / 7,
      ) + 1;
    const logsForWeek = logsByWeek.get(weekIndex) ?? [];

    logsByWeek.set(weekIndex, [...logsForWeek, log]);
  });

  return Array.from(logsByWeek.entries()).map(([weekIndex, weekLogs]) => {
    const sortedLogs = [...weekLogs].sort(
      (a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.setNumber - b.setNumber,
    );
    const averageLoadValue =
      sortedLogs.reduce((total, log) => total + log.loadValue, 0) / sortedLogs.length;

    return {
      weekIndex,
      startDate: sortedLogs[0]?.sessionDate ?? startedAt,
      endDate: sortedLogs.at(-1)?.sessionDate ?? startedAt,
      logs: sortedLogs,
      averageLoadValue,
      loadUnit: sortedLogs[0]?.loadUnit ?? "kg",
    };
  });
}

function buildHistoryPoints(weeklyLogs: WeeklyHistoryLog[]) {
  return weeklyLogs.map((week) => ({
    weekIndex: week.weekIndex,
    loadValue: week.averageLoadValue,
    loadUnit: week.loadUnit,
  }));
}

function HistoryChart({
  points,
  unit,
}: {
  points: HistoryPoint[];
  unit: string;
}) {
  if (points.length === 0) {
    return (
      <div className="rounded-card border border-foreground/7 bg-white px-5 py-10 text-center shadow-[0_18px_34px_rgba(36,48,24,0.08)]">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.04] text-foreground/55">
          <ChartNoAxesColumnIncreasing className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-[18px] font-semibold tracking-[-0.03em] text-foreground">
          No history yet
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-foreground/56">
          Log sets for this workout to start seeing weekly averages here.
        </p>
      </div>
    );
  }

  const minValue = Math.min(...points.map((point) => point.loadValue));
  const maxValue = Math.max(...points.map((point) => point.loadValue));
  const observedRange = Math.max(maxValue - minValue, 1);
  const lastPoint = points[points.length - 1]!;
  const priorPoint = points.length > 1 ? points[points.length - 2] : null;
  const observedLift = priorPoint
    ? Math.max(lastPoint.loadValue - priorPoint.loadValue, observedRange * 0.28)
    : Math.max(lastPoint.loadValue * 0.12, 0.5);
  const projectionStep = Math.max(observedLift, 0.5);
  const projectedPoints = [1, 2].map((offset) => ({
    weekIndex: lastPoint.weekIndex + offset,
    loadValue: lastPoint.loadValue + projectionStep * offset,
    loadUnit: lastPoint.loadUnit,
  }));
  const chartMaxValue = Math.max(maxValue, projectedPoints.at(-1)?.loadValue ?? maxValue);
  const valuePadding = Math.max(observedRange * 0.35, projectionStep * 0.6, 0.5);
  const scaleMinValue = Math.max(0, minValue - valuePadding);
  const scaleMaxValue = chartMaxValue + valuePadding;
  const range = Math.max(scaleMaxValue - scaleMinValue, 1);
  const displayPointCount = points.length + projectedPoints.length;
  const chartWidth = Math.max(340, displayPointCount * 76);
  const chartHeight = 220;
  const leftPad = 22;
  const rightPad = 22;
  const topPad = 20;
  const bottomPad = 54;
  const plotWidth = chartWidth - leftPad - rightPad;
  const plotHeight = chartHeight - topPad - bottomPad;
  const stepX = displayPointCount > 1 ? plotWidth / (displayPointCount - 1) : 0;
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: leftPad + index * stepX,
    y: topPad + (1 - (point.loadValue - scaleMinValue) / range) * plotHeight,
  }));
  const projectionChartPoints = projectedPoints.map((point, index) => ({
    ...point,
    x: leftPad + (points.length + index) * stepX,
    y: topPad + (1 - (point.loadValue - scaleMinValue) / range) * plotHeight,
  }));
  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const projectionPath = [chartPoints.at(-1), ...projectionChartPoints]
    .filter((point): point is (typeof chartPoints)[number] => Boolean(point))
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath =
    chartPoints.length > 1
      ? `${linePath} L ${chartPoints.at(-1)?.x ?? chartWidth - rightPad} ${chartHeight - bottomPad} L ${chartPoints[0]?.x ?? leftPad} ${chartHeight - bottomPad} Z`
      : "";

  return (
    <div className="rounded-card border border-foreground/7 bg-white p-4 shadow-[0_18px_34px_rgba(36,48,24,0.08)]">
      <div className="overflow-x-auto pb-1">
        <svg
          className="h-[220px]"
          style={{ width: chartWidth }}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label="Average weight by week chart"
        >
          <line
            x1={leftPad}
            x2={chartWidth - rightPad}
            y1={chartHeight - bottomPad}
            y2={chartHeight - bottomPad}
            stroke="rgba(17,23,15,0.12)"
          />
          <line
            x1={leftPad}
            x2={chartWidth - rightPad}
            y1={topPad + plotHeight / 2}
            y2={topPad + plotHeight / 2}
            stroke="rgba(17,23,15,0.06)"
          />
          <line
            x1={leftPad}
            x2={chartWidth - rightPad}
            y1={topPad}
            y2={topPad}
            stroke="rgba(17,23,15,0.05)"
          />
          {areaPath ? <path d={areaPath} fill="rgba(21,133,122,0.12)" /> : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke="#15857a"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3.5"
            />
          ) : null}
          {projectionPath ? (
            <path
              d={projectionPath}
              fill="none"
              stroke="#15857a"
              strokeDasharray="4 7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              opacity="0.58"
            />
          ) : null}
          {projectionChartPoints.map((point) => (
            <g key={`projected-week-${point.weekIndex}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r="3.5"
                fill="#ffffff"
                stroke="#15857a"
                strokeDasharray="2 3"
                strokeWidth="2"
                opacity="0.58"
              />
              <text
                x={point.x}
                y={chartHeight - 24}
                fill="rgba(17,23,15,0.3)"
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
              >
                {`Week ${point.weekIndex}`}
              </text>
            </g>
          ))}
          {chartPoints.map((point) => (
            <g key={`week-${point.weekIndex}`}>
              <line
                x1={point.x}
                x2={point.x}
                y1={chartHeight - bottomPad}
                y2={chartHeight - bottomPad + 6}
                stroke="rgba(17,23,15,0.18)"
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="5"
                fill="#ffffff"
                stroke="#15857a"
                strokeWidth="3"
              />
              <text
                x={point.x}
                y={chartHeight - 24}
                fill="rgba(17,23,15,0.52)"
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
              >
                {`Week ${point.weekIndex}`}
              </text>
              <text
                x={point.x}
                y={chartHeight - 10}
                fill="rgba(17,23,15,0.38)"
                fontSize="10"
                fontWeight="600"
                textAnchor="middle"
              >
                {`${formatLoadValue(point.loadValue)} ${unit}`}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 text-[12px] leading-5 text-foreground/54">
        Average weight lifted in each weekly cycle.
        {unit ? ` Unit: ${unit}.` : ""}
      </div>
    </div>
  );
}

function WeeklyLogs({ weeks, unit }: { weeks: WeeklyHistoryLog[]; unit: string }) {
  if (weeks.length === 0) {
    return (
      <div className="rounded-card border border-foreground/7 bg-white px-5 py-8 text-center shadow-[0_18px_34px_rgba(36,48,24,0.08)]">
        <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-foreground">
          No weekly logs yet
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-foreground/56">
          Completed sets for this exercise will appear here by week.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weeks.map((week) => (
        <section
          key={`week-log-${week.weekIndex}`}
          className="overflow-hidden rounded-card border border-foreground/7 bg-white shadow-[0_16px_30px_rgba(36,48,24,0.07)]"
        >
          <div className="flex items-end justify-between gap-3 border-b border-black/[0.04] px-4 py-3">
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.04em] text-foreground">
                {`Week ${week.weekIndex} log`}
              </h2>
              <p className="mt-0.5 text-[11px] font-medium text-foreground/46">
                {week.startDate === week.endDate
                  ? format(parseISO(week.startDate), "d MMM")
                  : `${format(parseISO(week.startDate), "d MMM")} - ${format(parseISO(week.endDate), "d MMM")}`}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground/40">
                Avg
              </div>
              <div className="text-[15px] font-semibold tracking-[-0.03em] text-foreground">
                {`${formatLoadValue(week.averageLoadValue)} ${unit}`}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_58px_72px_58px] border-b border-black/[0.04] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/42">
            <span>Date</span>
            <span className="text-center">Set</span>
            <span className="text-center">{unit}</span>
            <span className="text-right">Reps</span>
          </div>

          {week.logs.map((log) => (
            <div
              key={log.id}
              className="grid grid-cols-[1fr_58px_72px_58px] items-center px-4 py-2.5 text-[13px] text-foreground [&:not(:last-child)]:border-b [&:not(:last-child)]:border-black/[0.04]"
            >
              <span className="font-medium">{format(parseISO(log.sessionDate), "d MMM")}</span>
              <span className="text-center font-semibold">{log.setNumber}</span>
              <span className="text-center font-semibold">
                {formatLoadValue(log.loadValue)}
              </span>
              <span className="text-right font-semibold">{log.reps ?? "-"}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

// useSearchParams() opts the subtree into client-side rendering, so it has to
// sit under a Suspense boundary or the page fails to prerender at build time.
function WorkoutHistoryContent() {
  const searchParams = useSearchParams();
  const { state, hydrated } = useDietFit();
  const sessionDate = searchParams.get("date") ?? startOfTodayIso();
  const workoutEnvironment = searchParams.get("environment") === "home" ? "home" : "gym";
  const exerciseId = searchParams.get("exerciseId") ?? "";
  const exerciseName = searchParams.get("exerciseName") ?? "Workout";
  const preferredUnit = searchParams.get("unit") ?? "kg";
  const backHref = {
    pathname: "/workout",
    query: {
      date: sessionDate,
      environment: workoutEnvironment,
    },
  };

  if (!hydrated) {
    return <Card className="rounded-hero">Loading history...</Card>;
  }

  if (!state.onboardingCompleted || !state.workoutPlan || !state.profile) {
    return (
      <Card className="rounded-hero">
        Finish onboarding first so Fitmonk can load your workout history.
      </Card>
    );
  }

  const relevantLogs = getRelevantWorkoutLoadLogs(
    state.workoutLoadLogs ?? [],
    exerciseId,
    exerciseName,
    sessionDate,
    preferredUnit,
  );
  const weeklyLogs = buildWeeklyHistoryLogs(relevantLogs);
  const points = buildHistoryPoints(weeklyLogs);
  const actualUnit = weeklyLogs[0]?.loadUnit || preferredUnit;

  return (
    <div className="min-h-screen bg-transparent px-4 pb-8 pt-[calc(0.75rem+var(--safe-top))]">
      <section className="mx-auto w-full max-w-[460px]">
        <div className="flex items-center justify-between gap-3 pt-2">
          <Link
            href={backHref}
            className="flex items-center gap-1 text-[14px] font-semibold text-primary-strong transition active:scale-[0.97]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="rounded-full bg-primary-strong/8 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-strong">
            History
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
            {exerciseName}
          </div>
          <h1 className="mt-1.5 text-[30px] font-bold leading-[0.98] tracking-[-0.05em] text-foreground">
            Progress
          </h1>
        </div>

        <div className="mt-5">
          <HistoryChart points={points} unit={actualUnit} />
        </div>

        <div className="mt-4">
          <WeeklyLogs weeks={weeklyLogs} unit={actualUnit} />
        </div>
      </section>
    </div>
  );
}

export default function WorkoutHistoryPage() {
  return (
    <Suspense fallback={null}>
      <WorkoutHistoryContent />
    </Suspense>
  );
}
