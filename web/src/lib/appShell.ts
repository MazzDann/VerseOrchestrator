/**
 * Live-override Mantine AppShell's panel width during a drag (inline on <html> beats
 * AppShell's :root rule) — `null` removes the override once the new width is in state.
 */
export function setAppShellWidth(panel: 'navbar' | 'aside', px: number | null) {
  const st = document.documentElement.style;
  for (const v of [`--app-shell-${panel}-width`, `--app-shell-${panel}-offset`]) {
    if (px == null) st.removeProperty(v);
    else st.setProperty(v, `${px}px`);
  }
}
