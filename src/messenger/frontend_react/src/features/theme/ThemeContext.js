import { createContext } from "react";

// theme: 'dark' | 'light'
// preference: 'dark' | 'light' | 'system'
// accent: id from features/theme/accents.js ('lime' | 'sky' | ...)
export const ThemeContext = createContext({
  theme: "dark",
  preference: "dark",
  setPreference: () => {},
  accent: "lime",
  setAccent: () => {},
});
