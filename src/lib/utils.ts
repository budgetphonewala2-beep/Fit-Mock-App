import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SubscriptionTier } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isProTier(tier: SubscriptionTier) {
  return tier === "pro" || tier === "elite";
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function titleCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function startOfTodayIso() {
  return toLocalIsoDate(new Date());
}

export function toLocalIsoDate(date: Date) {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;

  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

export function sum(numbers: number[]) {
  return numbers.reduce((total, current) => total + current, 0);
}
