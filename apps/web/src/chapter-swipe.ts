type Point = { identifier: number; clientX: number; clientY: number };

/** Once scroll/multitouch wins, this gesture can never navigate a chapter. */
export function createChapterSwipe() {
  let candidate: { point: Point; last: Point; time: number } | undefined;
  let blocked = false;
  const cancel = () => {
    candidate = undefined;
    blocked = true;
  };
  const move = (points: ArrayLike<Point>) => {
    if (!candidate) return;
    const point = points[0];
    if (
      points.length !== 1 ||
      !point ||
      point.identifier !== candidate.point.identifier
    )
      return cancel();
    const x = Math.abs(point.clientX - candidate.point.clientX);
    const y = Math.abs(point.clientY - candidate.point.clientY);
    const stepX = Math.abs(point.clientX - candidate.last.clientX);
    const stepY = Math.abs(point.clientY - candidate.last.clientY);
    if ((y >= 10 && x < y * 1.5) || (stepY >= 12 && stepX < stepY * 1.5))
      return cancel();
    candidate.last = point;
  };
  return {
    start(points: ArrayLike<Point>, time: number) {
      if (blocked || points.length !== 1 || !points[0]) return cancel();
      candidate = { point: points[0], last: points[0], time };
    },
    move,
    cancel,
    end(
      changed: ArrayLike<Point>,
      remaining: number,
      time: number,
    ): -1 | 1 | undefined {
      move(changed);
      const gesture = candidate;
      candidate = undefined;
      if (remaining) {
        blocked = true;
        return;
      }
      const wasBlocked = blocked;
      blocked = false;
      if (
        wasBlocked ||
        !gesture ||
        time - gesture.time > 650 ||
        time < gesture.time
      )
        return;
      const x = gesture.last.clientX - gesture.point.clientX;
      const y = Math.abs(gesture.last.clientY - gesture.point.clientY);
      if (Math.abs(x) >= 64 && Math.abs(x) > y * 1.5) return x < 0 ? 1 : -1;
    },
  };
}
