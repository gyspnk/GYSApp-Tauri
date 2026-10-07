import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Icon, type IconName } from "./icons.js";
import { useMenuPresence } from "./use-menu-presence.js";

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
  animated?: boolean;
};

/** A small accessible listbox used in place of browser-native selects. */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className = "",
  disabled = false,
  animated = true,
}: SelectProps<T>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const menuPresent = useMenuPresence(open, menuRef);
  const [opensUp, setOpensUp] = useState(false);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[index] ?? options[0];
  const [activeIndex, setActiveIndex] = useState(index);
  const activeOptionId = open ? `${id}-option-${activeIndex}` : undefined;

  useEffect(() => setActiveIndex(index), [index]);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const option = menu?.children[activeIndex] as HTMLElement | undefined;
    if (!open || !menu || !option) return;
    const bounds = menu.getBoundingClientRect();
    const active = option.getBoundingClientRect();
    if (active.top < bounds.top) menu.scrollTop += active.top - bounds.top - 5;
    else if (active.bottom > bounds.bottom)
      menu.scrollTop += active.bottom - bounds.bottom + 5;
  }, [open, activeIndex]);
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
      const up = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      menu.style.setProperty(
        "--select-available-space",
        `${Math.max(44, up ? spaceAbove : spaceBelow)}px`,
      );
      setOpensUp(up);
    };

    updateDirection();
    let frame: number | undefined;
    const schedule = (event: Event) => {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      )
        return;
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        updateDirection();
      });
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [open, options.length]);

  const choose = (next: SelectOption<T>) => {
    onChange(next.value);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
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
    <div
      className={`control-select ${className}`}
      ref={rootRef}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      {label && (
        <span className="control-select-label" id={`${id}-label`}>
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        className="control-select-trigger"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuPresent ? id : undefined}
        aria-activedescendant={activeOptionId}
        aria-label={label}
        disabled={disabled || !selected}
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
      {menuPresent && (
        <div
          ref={menuRef}
          className={`control-select-menu${opensUp ? " is-open-up" : ""}${animated ? " is-animated" : ""}`}
          id={id}
          role="listbox"
          data-menu-open={open}
          data-menu-instant={!animated || undefined}
          inert={!open}
          aria-hidden={!open}
          tabIndex={0}
          aria-activedescendant={activeOptionId}
          onKeyDown={onKeyDown}
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
              onPointerMove={() => setActiveIndex(optionIndex)}
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
