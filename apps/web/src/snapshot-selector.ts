/** Stable derived snapshots let React ignore unrelated external-store ticks. */
export function createSnapshotSelector<T, U extends object>(
  read: () => T,
  select: (snapshot: T) => U,
): () => U {
  let previousSource: T;
  let previous: U | undefined;
  return () => {
    const source = read();
    if (previous !== undefined && Object.is(previousSource, source))
      return previous;
    const next = select(source);
    previousSource = source;
    if (
      previous &&
      Object.keys(next).length === Object.keys(previous).length &&
      (Object.keys(next) as Array<keyof U>).every((key) =>
        Object.is(next[key], previous?.[key]),
      )
    )
      return previous;
    previous = next;
    return next;
  };
}
