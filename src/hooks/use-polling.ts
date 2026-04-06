"use client";

import * as React from "react";

interface UsePollingOptions {
  enabled?: boolean;
  intervalMs: number;
  runImmediately?: boolean;
}

export function usePolling(
  callback: () => void | Promise<void>,
  { enabled = true, intervalMs, runImmediately = true }: UsePollingOptions
) {
  const onTick = React.useEffectEvent(callback);

  React.useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      await onTick();
    };

    if (runImmediately) {
      void tick();
    }

    const intervalId = window.setInterval(() => {
      void tick();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs, runImmediately]);
}
