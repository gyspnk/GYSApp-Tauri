export type PickerNumber = { text: string; replace: boolean };

/** A selected number is replaced by the first digit, then digits append. */
export function editPickerNumber(
  value: PickerNumber,
  key: string,
): PickerNumber {
  if (key === "Backspace")
    return {
      text: value.replace ? "" : value.text.slice(0, -1),
      replace: false,
    };
  if (!/^\d$/.test(key)) return value;
  const text = value.replace ? key : `${value.text}${key}`;
  if (text.length > 3) return value;
  return { text: text.replace(/^0+(?=\d)/, ""), replace: false };
}

export function validPickerNumber(text: string, maximum: number): boolean {
  const value = Number(text);
  return /^\d+$/.test(text) && value >= 1 && value <= maximum;
}
