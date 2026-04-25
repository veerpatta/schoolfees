"use client";

import { useRef } from "react";
import type { FormHTMLAttributes } from "react";

type AutoSubmitFormProps = FormHTMLAttributes<HTMLFormElement> & {
  debounceMs?: number;
};

const debouncedFieldNames = new Set([
  "query",
  "studentQuery",
  "entryQuery",
  "minPendingAmount",
]);

function isFormControl(target: EventTarget | null): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
}

function dateRangeIsReady(form: HTMLFormElement, target: HTMLInputElement) {
  if (target.type !== "date") {
    return true;
  }

  const fromDate = form.elements.namedItem("fromDate");
  const toDate = form.elements.namedItem("toDate");

  if (!(fromDate instanceof HTMLInputElement) || !(toDate instanceof HTMLInputElement)) {
    return true;
  }

  if (!fromDate.value && !toDate.value) {
    return true;
  }

  return Boolean(fromDate.value && toDate.value);
}

export function AutoSubmitForm({
  debounceMs = 450,
  onChange,
  onInput,
  onKeyDown,
  children,
  ...props
}: AutoSubmitFormProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function submit(form: HTMLFormElement) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    form.requestSubmit();
  }

  function scheduleSubmit(form: HTMLFormElement) {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => submit(form), debounceMs);
  }

  return (
    <form
      {...props}
      onChange={(event) => {
        onChange?.(event);

        if (event.defaultPrevented || !isFormControl(event.target)) {
          return;
        }

        const target = event.target;
        const form = event.currentTarget;

        if (target instanceof HTMLInputElement && !dateRangeIsReady(form, target)) {
          return;
        }

        if (
          target instanceof HTMLInputElement &&
          (debouncedFieldNames.has(target.name) || target.type === "search" || target.type === "text" || target.type === "number")
        ) {
          scheduleSubmit(form);
          return;
        }

        submit(form);
      }}
      onInput={(event) => {
        onInput?.(event);

        if (event.defaultPrevented || !isFormControl(event.target)) {
          return;
        }

        const target = event.target;

        if (
          target instanceof HTMLInputElement &&
          (debouncedFieldNames.has(target.name) || target.type === "search" || target.type === "text" || target.type === "number")
        ) {
          scheduleSubmit(event.currentTarget);
        }
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);

        if (event.defaultPrevented || event.key !== "Enter" || !isFormControl(event.target)) {
          return;
        }

        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
