// Whether this browser tab has already watched the board's opening scene (case-room-intro.tsx). Kept in a plain module
// so the upload page can reset it without loading the scene's code.
export const INTRO_SEEN_KEY = "threadpull:case-room-intro:v1";

/** Forget that the opening was seen, so the next arrival on the board plays it (storage failures never block anything). */
export function replayIntroNextTime() {
  try {
    window.sessionStorage.removeItem(INTRO_SEEN_KEY);
  } catch {
    // Private browsing / storage restrictions must never block the page.
  }
}
