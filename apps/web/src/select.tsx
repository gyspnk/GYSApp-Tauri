import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[index] ?? options[0];
  const [activeIndex, setActiveIndex] = useState(index);
  const activeOptionId = open ? `${id}-option-${activeIndex}` : undefined;

  useEffect(() => setActiveIndex(index), [index]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setOpensUp(false);
      return;
    }

    const updateDirection = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const triggerBox = trigger.getBoundingClientRect();
      const menuHeight = Math.min(280, menu.scrollHeight);
      const spaceBelow = window.innerHeight - triggerBox.bottom - 7;
      const spaceAbove = triggerBox.top - 7;
      setOpensUp(spaceBelow < menuHeight && spaceAbove > spaceBelow);
    };

    updateDirection();
    window.addEventListener("resize", updateDirection);
    window.addEventListener("scroll", updateDirection, true);
    return () => {
      window.removeEventListener("resize", updateDirection);
      window.removeEventListener("scroll", updateDirection, true);
    };
  }, [open, options.length]);

  const choose = (next: SelectOption<T>) => {
    onChange(next.value);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      event.preventDefault();
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

  const toggleOpen = () => {
    if (disabled || !selected) return;
    setActiveIndex(index);
    setOpen((current) => !current);
  };

  return (
    <div className={`control-select ${className}`} ref={rootRef}>
      {label && (
        <span className="control-select-label" id={`${id}-label`}>
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        className="control-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={activeOptionId}
        aria-label={label}
        disabled={disabled || !selected}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
            setOpen(false);
          }
        }}
        onClick={toggleOpen}
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
          ref={menuRef}
          className={`control-select-menu${opensUp ? " is-open-up" : ""}`}
          id={id}
          role="listbox"
          aria-label={label}
          aria-labelledby={label ? `${id}-label` : undefined}
        >
          {options.map((option, optionIndex) => (
            <button
              className={`control-select-option${optionIndex === activeIndex ? " is-active" : ""}${option.value === value ? " is-selected" : ""}`}
              id={`${id}-option-${optionIndex}`}
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
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
