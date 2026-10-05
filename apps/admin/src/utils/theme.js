const KEY = "demo-panel:theme";

/**
 * Light/dark preference, persisted in localStorage so a reload keeps it.
 *
 * Applied from main.jsx before the first render, so the page never paints in
 * the wrong theme. Not an inline script in index.html: the server's CSP is
 * `script-src 'self'`, which blocks inline scripts.
 *
 * With nothing saved yet, the OS setting decides. Storage access is guarded
 * because localStorage throws in private mode on some browsers.
 */
export const readDarkPreference = () => {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved === "dark") return true;
        if (saved === "light") return false;
    } catch {
        /* storage unavailable - fall through to the OS setting */
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
};

export const isDarkApplied = () => document.documentElement.classList.contains("dark-mode");

export const applyTheme = (dark) => {
    document.documentElement.classList.toggle("dark-mode", dark);
};

export const setDarkPreference = (dark) => {
    applyTheme(dark);
    try {
        localStorage.setItem(KEY, dark ? "dark" : "light");
    } catch {
        /* storage unavailable - the choice lasts until reload */
    }
};
