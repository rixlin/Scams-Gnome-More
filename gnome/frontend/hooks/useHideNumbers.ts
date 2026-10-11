"use client";

import { useEffect, useState, useCallback } from "react";
import { formatNumberDisplay } from "../lib/utils";

export const HIDE_NUMBERS_STORAGE_KEY = "gnome_hide_numbers";
export const HIDE_NUMBERS_CHANGED_EVENT = "gnome_hide_numbers_changed";

export function getStoredHideNumbers(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIDE_NUMBERS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setStoredHideNumbers(hide: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIDE_NUMBERS_STORAGE_KEY, hide ? "true" : "false");
    window.dispatchEvent(
      new CustomEvent<boolean>(HIDE_NUMBERS_CHANGED_EVENT, { detail: hide })
    );
  } catch {}
}

export function useHideNumbers() {
  const [hideNumbers, setHideNumbersState] = useState<boolean>(() =>
    getStoredHideNumbers()
  );

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === HIDE_NUMBERS_STORAGE_KEY) {
        setHideNumbersState(e.newValue === "true");
      }
    };

    const handleCustom = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      if (typeof customEvent.detail === "boolean") {
        setHideNumbersState(customEvent.detail);
      } else {
        setHideNumbersState(getStoredHideNumbers());
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(HIDE_NUMBERS_CHANGED_EVENT, handleCustom);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(HIDE_NUMBERS_CHANGED_EVENT, handleCustom);
    };
  }, []);

  const setHideNumbers = useCallback((value: boolean) => {
    setHideNumbersState(value);
    setStoredHideNumbers(value);
  }, []);

  const formatNumber = useCallback(
    (raw?: string | null) => {
      return formatNumberDisplay(raw, hideNumbers);
    },
    [hideNumbers]
  );

  return { hideNumbers, setHideNumbers, formatNumber };
}

