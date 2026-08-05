"use client";

import { useEffect, useMemo, useState } from "react";

function remaining(target: string) {
  const difference = Math.max(0, new Date(target).getTime() - Date.now());
  return {
    days: Math.floor(difference / 86_400_000),
    hours: Math.floor((difference % 86_400_000) / 3_600_000),
    minutes: Math.floor((difference % 3_600_000) / 60_000),
    seconds: Math.floor((difference % 60_000) / 1_000),
    complete: difference === 0,
  };
}

export function GameweekCountdown({ target }: { target: string }) {
  const initial = useMemo(() => remaining(target), [target]);
  const [time, setTime] = useState(initial);

  useEffect(() => {
    const timer = window.setInterval(() => setTime(remaining(target)), 1_000);
    return () => window.clearInterval(timer);
  }, [target]);

  if (time.complete) {
    return (
      <div className="rounded-3xl bg-[var(--accent)] p-6 text-[var(--brand-strong)]">
        <p className="text-xs font-black uppercase tracking-[0.16em]">Gameweek 1</p>
        <p className="mt-2 text-2xl font-black">The FPL deadline has passed.</p>
      </div>
    );
  }

  const units = [
    [time.days, "Days"],
    [time.hours, "Hours"],
    [time.minutes, "Minutes"],
    [time.seconds, "Seconds"],
  ] as const;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">Countdown to Gameweek 1</p>
      <p className="mt-2 text-sm font-bold text-white">Friday, 21 August 2026 · 5:30 PM Sierra Leone</p>
      <div className="mt-5 grid grid-cols-4 gap-2">
        {units.map(([value, label]) => (
          <div key={label} className="rounded-2xl bg-white/10 px-2 py-4 text-center">
            <p className="text-2xl font-black tabular-nums text-white">{String(value).padStart(2, "0")}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-blue-200">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
