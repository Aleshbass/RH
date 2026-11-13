/**
 * Runs before a Learn page paints (app/learn/layout.tsx), so a dark page never flashes white.
 * Kept out of the client theme module so the server layout can import it as plain text.
 */
export const LEARN_THEME_STORAGE_KEY = 'rehabify:learn-theme'
export const LEARN_DARK_CLASS = 'learn-dark'

export const LEARN_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${LEARN_THEME_STORAGE_KEY}');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('${LEARN_DARK_CLASS}',d)}catch(e){}})()`
