import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./icons.js";
import { useMenuPresence } from "./use-menu-presence.js";
import "./multi-select.css";

export type MultiSelectOption = {
  value: string;
  label: string;
  group?: string;
};

export type MultiSelectGroup = {
  label: string;
  values: readonly string[];
};

type MultiSelectProps = {
  values: readonly string[];
  options: readonly MultiSelectOption[];
  onChange: (values: string[]) => void;
  label: string;
  emptyLabel: string;
  groups?: readonly MultiSelectGroup[];
  countLabel?: (count: number) => string;
  searchPlaceholder?: string;
  className?: string;
};

export function multiSelectSummary(
  values: readonly string[],
  options: readonly MultiSelectOption[],
  emptyLabel: string,
  countLabel: (count: number) => string = (count) => `${count} dipilih`,
): string {
  if (!values.length) return emptyLabel;
  if (values.length === 1) {
    const option = options.find((candidate) => candidate.value === values[0]);
    return option ? option.label : emptyLabel;
  }
  return countLabel(values.length);
}

/** Checkbox list in a popover: the menu stays open while books are toggled,
 * which is the behaviour a real multi-select needs. */
export function MultiSelect({
  values,
  options,
  onChange,
  label,
  emptyLabel,
  groups = [],
  countLabel,
  searchPlaceholder,
  className = "",
}: MultiSelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const menuPresent = useMenuPresence(open, menuRef);
  const [query, setQuery] = useState("");
  const selected = new Set(values);
  const matchedGroup =
    values.length > 1
      ? groups.find(
          (group) =>
            group.values.length === values.length &&
            group.values.every((value) => selected.has(value)),
        )
      : undefined;
  const summary =
    matchedGroup !== undefined
      ? `${matchedGroup.label} (${values.length})`
      : multiSelectSummary(values, options, emptyLabel, countLabel);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Move focus into the dialog so Escape and the screen-reader dialog
    // announcement work before the pointer reaches the list; focusing the
    // container (not the search field) keeps the phone keyboard closed.
    menuRef.current?.focus({ preventScroll: true });
  }, [open, menuPresent]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div
      className={`multiselect ${className}`.trim()}
      ref={rootRef}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className="multiselect-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="multiselect-value">{summary}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {menuPresent && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="multiselect-scrim"
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
      {menuPresent && (
        <div
          className="multiselect-menu"
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          ref={menuRef}
        >
          {options.length > 8 && (
            <input
              className="multiselect-search"
              type="search"
              value={query}
              placeholder={searchPlaceholder ?? label}
              aria-label={label}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          )}
          {groups.length > 0 && (
            <div className="multiselect-groups">
              <button
                type="button"
                className="multiselect-group"
                aria-pressed={values.length === 0}
                onClick={() => onChange([])}
              >
                {emptyLabel}
              </button>
              {groups.map((group) => (
                <button
                  key={group.label}
                  type="button"
                  className="multiselect-group"
                  aria-pressed={
                    group.values.length === values.length &&
                    group.values.every((value) => selected.has(value))
                  }
                  onClick={() => onChange([...group.values])}
                >
                  {group.label}
                </button>
              ))}
            </div>
          )}
          <div className="multiselect-list" id={`${id}-list`}>
            {visible.map((option) => (
              <label key={option.value} className="multiselect-option">
                <input
                  type="checkbox"
                  checked={selected.has(option.value)}
                  onChange={() => toggle(option.value)}
                />
                <span>{option.label}</span>
                {option.group && (
                  <span className="multiselect-group-tag">{option.group}</span>
                )}
              </label>
            ))}
            {visible.length === 0 && (
              <p className="multiselect-empty">{emptyLabel}</p>
            )}
          </div>
          <div className="multiselect-footer">
            <span>
              {multiSelectSummary(values, options, emptyLabel, countLabel)}
            </span>
            <button type="button" onClick={() => setOpen(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
