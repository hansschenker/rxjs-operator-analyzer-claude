/** Design tokens mirrored from rxjs-ds `tokens.css` (Material Pink 700 primary). */
export const theme = {
  primary: '#c2185b',
  primaryLight: '#d81b60',
  primaryDark: '#ad1457',
  primaryBg: '#fce4ec',
  pink100: '#f8bbd0',
  pink200: '#f48fb1',
  pink300: '#f06292',
  accent: '#d32f2f',
  white: '#ffffff',
  gray50: '#fafafa',
  gray100: '#f5f5f5',
  gray200: '#eeeeee',
  gray300: '#e0e0e0',
  gray400: '#bdbdbd',
  gray500: '#9e9e9e',
  gray600: '#757575',
  gray700: '#616161',
  gray800: '#424242',
  gray900: '#212121',
  codeBg: '#1a1a2e',
  codeText: '#e0e0e0',
  fontSans: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
  fontMono: "'Roboto Mono', 'Droid Sans Mono', 'Courier New', monospace",
} as const;

/** Per-category accent colours (from rxjs-ds OperatorCard). */
export const categoryAccent: Readonly<Record<string, string>> = {
  transformation: '#e91e63',
  filtering: '#9c27b0',
  creation: '#3f51b5',
  combination: '#00897b',
  error: '#d32f2f',
  utility: '#f57c00',
  conditional: '#0288d1',
  multicasting: '#c2185b',
  mathematical: '#558b2f',
};

export function accentFor(category: string): string {
  return categoryAccent[category.toLowerCase()] ?? theme.primary;
}

/** CSS custom properties for standalone HTML output and the web viewer. */
export const tokensCss = `:root {
  --rxjs-color-primary: ${theme.primary};
  --rxjs-color-primary-light: ${theme.primaryLight};
  --rxjs-color-primary-dark: ${theme.primaryDark};
  --rxjs-color-primary-bg: ${theme.primaryBg};
  --rxjs-color-accent: ${theme.accent};
  --rxjs-color-surface: ${theme.white};
  --rxjs-color-background: ${theme.gray50};
  --rxjs-color-text: ${theme.gray900};
  --rxjs-color-text-secondary: ${theme.gray600};
  --rxjs-color-border: ${theme.gray300};
  --rxjs-color-code-bg: ${theme.codeBg};
  --rxjs-color-code-text: ${theme.codeText};
  --rxjs-font-sans: ${theme.fontSans};
  --rxjs-font-mono: ${theme.fontMono};
  --rxjs-radius-sm: 4px;
  --rxjs-radius-md: 6px;
  --rxjs-radius-lg: 8px;
}`;
