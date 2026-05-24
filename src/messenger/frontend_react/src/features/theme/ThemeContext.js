import { createContext } from "react";

// theme: 'dark' | 'light'
// preference: 'dark' | 'light' | 'system'
export const ThemeContext = createContext({
  theme: "dark",
  preference: "dark",
  setPreference: () => {},
});
