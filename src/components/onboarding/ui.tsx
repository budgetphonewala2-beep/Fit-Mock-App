"use client";

import {
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Screen, ScreenBody, ScreenGrow } from "@/components/ui/screen";

/* Fitmonk logomark — ring + orange arc (transparent, works on any background) */
export function FitmonkMark({
  size = 84,
  ring = "var(--mint-500)",
  arc = "var(--orange-500)",
}: {
  size?: number;
  ring?: string;
  arc?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="54" r="30" stroke={ring} strokeWidth="9" />
      <path d="M44 26 C54 21, 66 22, 73 30" stroke={arc} strokeWidth="9" strokeLinecap="round" />
      <circle cx="50" cy="54" r="6" fill={ring} />
    </svg>
  );
}

type BtnVariant = "primary" | "brand" | "ghost" | "light";

/**
 * Thin shim over the shared `<Button>` so onboarding steps keep their
 * existing call sites (`<Btn variant="primary" icon={...}>Continue</Btn>`)
 * but render through the unified primitive. Same variants, same 56px
 * pill footer button — one component driving both worlds.
 */
export function Btn({
  variant = "primary",
  children,
  icon,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  icon?: ReactNode;
}) {
  return (
    <Button variant={variant} size="lg" className={className} {...props}>
      {children}
      {icon}
    </Button>
  );
}

export function Tile({
  icon,
  title,
  desc,
  selected,
  onClick,
  stack,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  selected?: boolean;
  onClick: () => void;
  stack?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("fm-tile", stack && "fm-tile--stack", selected && "is-selected")}
      onClick={onClick}
    >
      {icon ? <span className="fm-tile__ic">{icon}</span> : null}
      <span className="fm-tile__txt">
        <span className="fm-tile__title">{title}</span>
        {desc ? <span className="fm-tile__desc">{desc}</span> : null}
      </span>
      {!stack ? (
        <span className="fm-tile__check">
          <Check />
        </span>
      ) : null}
    </button>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { v: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="fm-seg">
      {options.map((option) => (
        <button
          key={option.v}
          type="button"
          className={value === option.v ? "is-on" : ""}
          onClick={() => onChange(option.v)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function TopBar({
  step,
  total,
  onBack,
}: {
  step: number;
  total: number;
  onBack?: (() => void) | null;
}) {
  const bars = [];

  for (let i = 0; i < total; i += 1) {
    const cls = i < step ? "is-done" : i === step ? "is-active" : "";
    bars.push(<span key={i} className={cls} />);
  }

  return (
    <div className="fm-topbar">
      {onBack ? (
        <button className="fm-back" onClick={onBack} aria-label="Back" type="button">
          <ArrowLeft />
        </button>
      ) : (
        <span style={{ width: 40 }} />
      )}
      <div className="fm-progress">{bars}</div>
      <span className="fm-step-count">
        {Math.min(step + 1, total)}/{total}
      </span>
    </div>
  );
}

export function Stepper({
  value,
  unit,
  onMinus,
  onPlus,
}: {
  value: number;
  unit: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="fm-stepper">
      <button className="fm-round" onClick={onMinus} aria-label="Decrease" type="button">
        <Minus />
      </button>
      <div className="fm-bignum">
        {value}
        <small>{unit}</small>
      </div>
      <button className="fm-round" onClick={onPlus} aria-label="Increase" type="button">
        <Plus />
      </button>
    </div>
  );
}

// A finger-scrollable ruler: drag left/right (or arrow keys) to change the
// value under the fixed centre needle. Replaces the -/+ stepper.
export function ScrollPicker({
  value,
  min,
  max,
  unit,
  onChange,
  formatValue,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
  // Custom display for the big number (e.g. height in feet'inches"). When
  // omitted the picker falls back to `{value}<small>{unit}</small>`.
  formatValue?: (value: number) => React.ReactNode;
  ariaLabel?: string;
}) {
  const PX_PER_UNIT = 14;
  const drag = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  const ticks: number[] = [];
  for (let i = min; i <= max; i += 1) ticks.push(i);
  const offset = -(value - min) * PX_PER_UNIT;

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, v: value };
  }
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const next = clamp(drag.current.v - Math.round(dx / PX_PER_UNIT));
    if (next !== value) onChange(next);
  }
  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  }
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(clamp(value - 1));
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(clamp(value + 1));
    }
  }

  return (
    <div className="fm-scrollpick">
      <div className="fm-bignum">
        {formatValue ? (
          formatValue(value)
        ) : (
          <>
            {value}
            <small>{unit}</small>
          </>
        )}
      </div>
      <div
        className="fm-ruler fm-ruler--drag"
        role="slider"
        tabIndex={0}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={ariaLabel ?? `Set value in ${unit}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <div className="fm-ruler__track" style={{ transform: `translateX(${offset - 1}px)` }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className={cn("fm-ruler__tick", tick % 5 === 0 && "maj")}
              style={{ height: tick % 5 === 0 ? 40 : 22 }}
            />
          ))}
        </div>
        <div className="fm-ruler__needle" />
      </div>
    </div>
  );
}

export function Ruler({ value, min, max }: { value: number; min: number; max: number }) {
  const ticks = [];

  for (let i = min; i <= max; i += 1) {
    ticks.push(i);
  }

  const offset = -(value - min) * 14;

  return (
    <div className="fm-ruler">
      <div className="fm-ruler__track" style={{ transform: `translateX(${offset - 1}px)` }}>
        {ticks.map((tick) => (
          <span
            key={tick}
            className={cn("fm-ruler__tick", tick % 5 === 0 && "maj")}
            style={{ height: tick % 5 === 0 ? 40 : 22 }}
          />
        ))}
      </div>
      <div className="fm-ruler__needle" />
    </div>
  );
}

export function Label({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <div
      style={{
        fontWeight: 700,
        fontSize: 13,
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        margin: "0 0 8px",
        textAlign: center ? "center" : "left",
      }}
    >
      {children}
    </div>
  );
}

export function Frame({
  step,
  total,
  onBack,
  children,
}: {
  step: number;
  total: number;
  onBack?: (() => void) | null;
  children: ReactNode;
}) {
  return (
    <Screen theme="light">
      <TopBar step={step} total={total} onBack={onBack} />
      <ScreenBody className="pt-2 pb-6">{children}</ScreenBody>
    </Screen>
  );
}

export function Foot({
  onNext,
  disabled,
  label,
}: {
  onNext: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <>
      <ScreenGrow />
      <div className="flex w-full flex-col gap-2.5 pt-3.5 pb-6">
        <Btn variant="primary" onClick={onNext} disabled={disabled} icon={<ArrowRight />}>
          {label || "Continue"}
        </Btn>
      </div>
    </>
  );
}
