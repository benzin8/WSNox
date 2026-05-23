export const STORAGE_KEY = "wsnox.notifications";

export const TONES = {
  ding:  { label: "Ding",  freqs: [880],        durationMs: 200 },
  chime: { label: "Chime", freqs: [660, 880],   durationMs: 400 },
  bell:  { label: "Bell",  freqs: [1320],       durationMs: 500 },
};

export const DEFAULT_SETTINGS = {
  sound:      { enabled: true,  sample: "ding" },
  desktop:    { enabled: false },
  titleBadge: { enabled: true },
  mutedChats: [],
};

export const APP_TITLE = "WSNox";
