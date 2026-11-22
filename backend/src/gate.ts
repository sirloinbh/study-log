// A fixed number of slots handed out without waiting (#266, #267): `enter` says no when none is
// free, and the caller answers 503 so the person can try again, instead of piling work up in memory
// or on a paid API.
export function createGate(slots: number) {
  let used = 0;
  return {
    enter() {
      if (used >= slots) return false;
      used += 1;
      return true;
    },
    leave() {
      used -= 1;
    },
  };
}
