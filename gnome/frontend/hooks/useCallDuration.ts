"use client";

import { useEffect, useState } from "react";

export function useCallDuration(
  startedAt: string | Date,
  status: "active" | "ended",
  initialDurationSeconds: number = 0,
  endedAt?: string | Date | null
): number {
  const computeFinalDuration = (): number => {
    const startTime = new Date(startedAt).getTime();
    if (endedAt) {
      const endTime = new Date(endedAt).getTime();
      if (!isNaN(startTime) && !isNaN(endTime) && endTime >= startTime) {
        return Math.max(1, Math.floor((endTime - startTime) / 1000));
      }
    }
    if (initialDurationSeconds > 0) return initialDurationSeconds;
    return 0;
  };

  const [elapsed, setElapsed] = useState<number>(() => {
    if (status !== "active") {
      return computeFinalDuration();
    }
    const startTime = new Date(startedAt).getTime();
    if (isNaN(startTime)) return initialDurationSeconds;
    return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  });

  useEffect(() => {
    if (status !== "active") {
      return;
    }

    const startTime = new Date(startedAt).getTime();
    if (isNaN(startTime)) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - startTime) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt, status]);

  if (status !== "active") {
    return computeFinalDuration();
  }

  return elapsed;
}
