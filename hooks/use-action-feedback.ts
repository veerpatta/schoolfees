"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/components/ui/toast";

/**
 * The shape every server action in this app settles into: a status plus a
 * sentence a human can read. Kept loose on purpose so one hook can serve
 * surfaces whose state carries extra fields.
 */
export type FeedbackActionState = {
  status?: string | null;
  message?: string | null;
};

export type ActionFeedbackOptions = {
  /** Toast heading on success. */
  successTitle?: string;
  /** Toast heading on failure. */
  errorTitle?: string;
  /** Toast heading when the action succeeded but something needs a look. */
  warningTitle?: string;
  /**
   * Re-render the server components on success so the change is visible without
   * a manual reload. Turn off only when the surface navigates away itself.
   */
  refreshOnSuccess?: boolean;
  onSuccess?: (state: FeedbackActionState) => void;
  onError?: (state: FeedbackActionState) => void;
};

const SUCCESS_STATUSES = new Set(["success", "ok", "done", "completed"]);
/**
 * The action DID its work, but part of it needs a human. A discount that could
 * not be applied to a paid installment is the case this exists for: reporting
 * it as a plain success is how a Rs 2,000 discount went unnoticed for two
 * months. Warning states still refresh — the save happened.
 */
const WARNING_STATUSES = new Set(["warning", "needs_review", "partial"]);
const ERROR_STATUSES = new Set(["error", "failed", "failure"]);

/**
 * Announces the result of a server action and refreshes the page so the change
 * is actually visible.
 *
 * Both halves were missing across most of the app: a record would be saved or
 * deleted with no confirmation and no visible change, so staff would repeat the
 * action or assume it had failed. Every `useActionState` surface should run
 * this against its state.
 */
export function useActionFeedback(
  state: FeedbackActionState,
  options: ActionFeedbackOptions = {},
) {
  const router = useRouter();
  const {
    successTitle = "Saved",
    errorTitle = "Could not save",
    warningTitle = "Saved — needs a look",
    refreshOnSuccess = true,
    onSuccess,
    onError,
  } = options;

  // A server action can settle on the same status and message twice in a row
  // (saving the same edit again). Tracking the object identity rather than its
  // contents means the second save still announces itself.
  const lastHandled = useRef<FeedbackActionState | null>(null);

  useEffect(() => {
    const status = (state?.status ?? "").toString().toLowerCase();

    if (!status || status === "idle" || lastHandled.current === state) {
      return;
    }

    lastHandled.current = state;

    if (SUCCESS_STATUSES.has(status)) {
      // Always announce. Gating this on `state.message` was a silent-success
      // path hiding inside the hook that exists to prevent silent success —
      // an action that returns success with no sentence still has to say so.
      toast({
        title: successTitle,
        description: state.message ?? undefined,
        tone: "success",
      });

      if (refreshOnSuccess) {
        router.refresh();
      }

      onSuccess?.(state);
      return;
    }

    if (WARNING_STATUSES.has(status)) {
      toast({
        title: warningTitle,
        description: state.message ?? undefined,
        tone: "warning",
      });

      // The save DID happen, so the screen still has to catch up.
      if (refreshOnSuccess) {
        router.refresh();
      }

      onSuccess?.(state);
      return;
    }

    if (ERROR_STATUSES.has(status)) {
      // Never swallow a failure silently: fall back to a generic sentence when
      // the action did not supply one.
      toast({
        title: errorTitle,
        description: state.message ?? "Something went wrong. Please try again.",
        tone: "danger",
      });
      onError?.(state);
    }
  }, [state, router, successTitle, errorTitle, warningTitle, refreshOnSuccess, onSuccess, onError]);
}

/**
 * Same behaviour for a surface that drives many actions from one component —
 * Master Data alone has thirteen. One effect over the whole set keeps the hook
 * count fixed, which calling `useActionFeedback` in a loop would not.
 */
export function useActionFeedbackMany(
  states: readonly FeedbackActionState[],
  options: ActionFeedbackOptions = {},
) {
  const router = useRouter();
  const {
    successTitle = "Saved",
    errorTitle = "Could not save",
    warningTitle = "Saved — needs a look",
    refreshOnSuccess = true,
  } = options;

  // Each settled action produces a fresh state object, so identity is enough to
  // tell a new result from one already announced.
  const announced = useRef<WeakSet<object>>(new WeakSet());

  useEffect(() => {
    let sawSuccess = false;

    for (const state of states) {
      if (!state || typeof state !== "object" || announced.current.has(state)) {
        continue;
      }

      const status = (state.status ?? "").toString().toLowerCase();

      if (!status || status === "idle") {
        continue;
      }

      announced.current.add(state);

      if (SUCCESS_STATUSES.has(status)) {
        toast({
          title: successTitle,
          description: state.message ?? undefined,
          tone: "success",
        });
        sawSuccess = true;
      } else if (WARNING_STATUSES.has(status)) {
        toast({
          title: warningTitle,
          description: state.message ?? undefined,
          tone: "warning",
        });
        sawSuccess = true;
      } else if (ERROR_STATUSES.has(status)) {
        toast({
          title: errorTitle,
          description: state.message ?? "Something went wrong. Please try again.",
          tone: "danger",
        });
      }
    }

    if (sawSuccess && refreshOnSuccess) {
      router.refresh();
    }
  }, [states, router, successTitle, errorTitle, warningTitle, refreshOnSuccess]);
}
