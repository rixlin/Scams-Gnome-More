"use client";

import { useEffect, useState } from "react";

export function useCallDuration(
  startedAt: string | Date,
  status: "active" | "ended",
  initialDurationSeconds: number = 0
): number {
  const [elapsed, setElapsed] = useState<number>(() => {
    if (status !== "active") return initialDurationSeconds;
    const startTime = new Date(startedAt).getTime();
    if (isNaN(startTime)) return initialDurationSeconds;
    return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  });

  useEffect(() => {
    if (status !== "active") return;

    const startTime = new Date(startedAt).getTime();
    if (isNaN(startTime)) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - startTime) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, status]);

  if (status !== "active") {
    return initialDurationSeconds;
  }

  return elapsed;
}
