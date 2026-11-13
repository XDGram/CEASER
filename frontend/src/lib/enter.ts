const KEY = "ceaser:enter-app";

/* Remembers that the visitor asked to enter the app, across a wallet redirect. */
export const markEnter = () => {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode */
  }
};
export const takeEnter = (): boolean => {
  try {
    const v = sessionStorage.getItem(KEY) === "1";
    if (v) sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return false;
  }
};
