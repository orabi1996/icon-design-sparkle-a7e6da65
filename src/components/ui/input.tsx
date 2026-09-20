import * as React from "react";

import { cn } from "@/lib/utils";

import { toEnglishDigits } from "@/lib/number-normalizer";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, onInput, ...props }, ref) => {
    const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
      const target = e.currentTarget;
      if (target.value && /[٠-٩۰-۹]/.test(target.value)) {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        target.value = toEnglishDigits(target.value);
        if (start !== null && end !== null) {
          target.setSelectionRange(start, end);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (onInput as any)?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.value && /[٠-٩۰-۹]/.test(e.target.value)) {
        e.target.value = toEnglishDigits(e.target.value);
      }
      onChange?.(e);
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onInput={handleInput}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
