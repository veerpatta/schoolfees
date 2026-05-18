"use client";

import { useEffect } from "react";

import { recordOfficeMetric } from "@/lib/quality/office-telemetry";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    navigator.serviceWorker
      .register("/service-worker.js")
      .then(() => {
        recordOfficeMetric({
          area: "app-shell",
          name: "offline_shell_ready",
          metadata: { result: "registered" },
        });
      })
      .catch(() => {
        recordOfficeMetric({
          area: "app-shell",
          name: "office_error_review_needed",
          metadata: { result: "offline-shell-registration-failed" },
        });
      });
  }, []);

  return null;
}
