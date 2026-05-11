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
          "flex min-h-[88px] w-full rounded-md border border-input bg-surface text-foreground",
          "px-3 py-2 text-sm shadow-xs transition-[border-color,box-shadow,background-color] duration-150",
          "placeholder:text-subtle-foreground",
          "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-2",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30",
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
