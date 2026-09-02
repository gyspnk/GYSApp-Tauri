import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "./icons.js";

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  shortLabel?: string | undefined;
  icon?: IconName | undefined;
  hint?: string | undefined;
};

type SelectProps<T extends string | number> = {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  label?: string | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
};

/** A small accessible listbox used in place of browser-native selects. */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className = "",
  disabled = false,
}: SelectProps<T>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[index] ?? options[0];
  const [activeIndex, setActiveIndex] = useState(index);

  useEffect(() => setActiveIndex(index), [index]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const choose = (next: SelectOption<T>) => {
    onChange(next.value);
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open && options[activeIndex]) choose(options[activeIndex]);
      else setOpen(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        event.key === "ArrowDown"
          ? Math.min(options.length - 1, current + 1)
          : Math.max(0, current - 1),
      );
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(
        event.key === "Home" ? 0 : Math.max(0, options.length - 1),
      );
    }
  };

  return (
    <div className={`control-select ${className}`} ref={rootRef}>
      {label && <span className="control-select-label">{label}</span>}
      <button
        className="control-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        disabled={disabled || !selected}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        <span className="control-select-value">
          {selected?.icon && (
            <Icon
              name={selected.icon}
              size={15}
              className="control-select-icon"
            />
          )}
          {selected?.shortLabel ?? selected?.label ?? "—"}
        </span>
        <span className="control-select-chevron" aria-hidden="true">
          <Icon name="chevronDown" size={13} />
        </span>
      </button>
      {open && (
        <div
          className="control-select-menu"
          id={id}
          role="listbox"
          aria-label={label}
        >
          {options.map((option, optionIndex) => (
            <button
              className={`control-select-option${optionIndex === activeIndex ? " is-active" : ""}${option.value === value ? " is-selected" : ""}`}
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActiveIndex(optionIndex)}
              onClick={() => choose(option)}
            >
              <span className="control-select-option-content">
                {option.icon && (
                  <Icon
                    name={option.icon}
                    size={15}
                    className="control-select-icon"
                  />
                )}
                <span>{option.label}</span>
              </span>
              {option.hint && <small>{option.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
