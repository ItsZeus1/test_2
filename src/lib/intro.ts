/**
 * Module-level memory (lives for the whole browser session, survives page switches):
 * once the first-visit entrance animations have played, they never replay.
 */
export const intro = { played: false };

/** Called once the gate opens; the longest intro (4 s flame sweep) is over after ~4.6 s. */
export function markIntroPlayedSoon(): void {
  if (intro.played) return;
  window.setTimeout(() => {
    intro.played = true;
  }, 4600);
}
