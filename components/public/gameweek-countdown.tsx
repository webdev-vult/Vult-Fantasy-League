"use client";

import { useEffect, useMemo, useState } from "react";

function remaining(target: number) {
  const totalSeconds = Math.max(0, Math.floor((target - Date.now()) / 1000));
  return {
    totalSeconds,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function GameweekCountdown({ deadlineTime }: { deadlineTime: string }) {
  const target = useMemo(() => new Date(deadlineTime).getTime(), [deadlineTime]);
  const [time, setTime] = useState(() => remaining(target));

  useEffect(() => {
    const update = () => setTime(remaining(target));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  if (time.totalSeconds <= 0) {
    return (
      <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm font-black text-green-800">
        The Gameweek 1 deadline has passed.
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {units.map(([value, label]) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-center">
          <p className="text-3xl font-black tabular-nums text-white">{String(value).padStart(2, "0")}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-200">{label}</p>
        </div>
      ))}
    </div>
  );
}
