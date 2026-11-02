/**
 * One first-visit overlay at a time. Welcome tours and the app setup prompt open on their own, and
 * two at once block each other (a modal dialog makes everything outside it unclickable, while the
 * tour's backdrop covers the dialog). A tour marks itself open here and waits for any dialog
 * already open; the app setup prompt waits for the tour to close.
 */

const TOUR_CLOSED_EVENT = 'rehabify:tour-closed';

export function markTourOpen(open: boolean) {
  document.documentElement.dataset.tourOpen = open ? '1' : '';
  if (!open) window.dispatchEvent(new Event(TOUR_CLOSED_EVENT));
}

function isTourOpen() {
  return document.documentElement.dataset.tourOpen === '1';
}

/** Runs `callback` once no tour is open (now, or when the open one closes). Returns a cancel. */
export function whenNoTourOpen(callback: () => void): () => void {
  if (!isTourOpen()) {
    callback();
    return () => undefined;
  }
  const onClosed = () => {
    window.removeEventListener(TOUR_CLOSED_EVENT, onClosed);
    callback();
  };
  window.addEventListener(TOUR_CLOSED_EVENT, onClosed);
  return () => window.removeEventListener(TOUR_CLOSED_EVENT, onClosed);
}

function dialogOnScreen() {
  return Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'));
}

/**
 * True while a modal dialog (consent, app setup...) is open, or a self-opening prompt has its
 * turn (it may not be drawn yet): a tour waits for it.
 */
export function isDialogOpen() {
  return promptTurn !== null || dialogOnScreen();
}

/**
 * Prompts that open on their own (app setup, offline PIN, physio setup reminder) take turns: one at a time, never over
 * another dialog or a tour. Taking the turn checks and claims it in one step, so two prompts
 * can't both open; endPromptTurn hands it to whoever is waiting.
 */
let promptTurn: string | null = null;
const PROMPT_TURN_FREED = 'rehabify:prompt-turn-freed';

/** Runs `open` once it's this prompt's turn (now, or when the screen is free). Returns a cancel. */
export function whenPromptTurn(name: string, open: () => void): () => void {
  let cancelled = false;
  let timer = 0;
  const tryTake = () => {
    if (cancelled) return;
    const free = (promptTurn === null || promptTurn === name) && !dialogOnScreen() && !isTourOpen();
    if (free) {
      promptTurn = name;
      window.removeEventListener(PROMPT_TURN_FREED, onFreed);
      open();
      return;
    }
    timer = window.setTimeout(tryTake, 1500);
  };
  const onFreed = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(tryTake, 600);
  };
  window.addEventListener(PROMPT_TURN_FREED, onFreed);
  tryTake();
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    window.removeEventListener(PROMPT_TURN_FREED, onFreed);
  };
}

/** The prompt closed: the next one waiting may open. */
export function endPromptTurn(name: string) {
  if (promptTurn !== name) return;
  promptTurn = null;
  window.dispatchEvent(new Event(PROMPT_TURN_FREED));
}
