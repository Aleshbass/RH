// Shared by the clinic theme provider (client) and the root layout (server).

export const CLINIC_THEME_STORAGE_KEY = 'rehabify:clinic-theme'

/**
 * Applies the saved (or system) clinic theme before first paint so a
 * dark-mode user never sees a light flash on a full page load.
 */
export const clinicThemeNoFlashScript = `(function(){try{var t=localStorage.getItem('${CLINIC_THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t}catch(e){}})()`
