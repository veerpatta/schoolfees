import * as React from "react";

import { cn } from "@/lib/utils";

type TextareaProps = React.ComponentProps<"textarea"> & {
  autoGrow?: boolean;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoGrow = true, onInput, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement>(null);

    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

    const resize = React.useCallback(() => {
      const element = innerRef.current;
      if (!element || !autoGrow) return;

      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }, [autoGrow]);

    React.useEffect(() => {
      resize();
    }, [props.value, resize]);

    return (
      <textarea
        ref={innerRef}
        className={cn(
          "flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        onInput={(event) => {
          resize();
          onInput?.(event);
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
