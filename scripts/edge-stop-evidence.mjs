/** Stop may cancel synthesis or stop audio after a fast synthesis has finished. */
export function edgeStopEvidence(events, previousIds = []) {
  const previous = new Set(previousIds);
  const current = events.filter(
    (event) => event.level === "info" && !previous.has(event.id),
  );
  if (current.some((event) => event.scope === "tts.edge.abort"))
    return "network-abort";
  if (
    current.some(
      (event) =>
        event.scope === "tts.edge.audio" &&
        /^Received [1-9]\d* audio bytes$/.test(event.message),
    )
  )
    return "synthesis-complete";
}
