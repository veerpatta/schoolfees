import { useCallback, useRef } from "react";

export function useScrollIntoView<T extends HTMLElement>(options?: ScrollIntoViewOptions) {
  const ref = useRef<T>(null);

  const scrollIntoView = useCallback(
    (delay = 0) => {
      const element = ref.current;
      if (!element) return;

      const scrollOptions = { behavior: "smooth", block: "center", ...options } satisfies ScrollIntoViewOptions;
      if (delay > 0) {
        setTimeout(() => element.scrollIntoView(scrollOptions), delay);
        return;
      }

      element.scrollIntoView(scrollOptions);
    },
    [options],
  );

  return { ref, scrollIntoView };
}
