export type ThemePresetKey = 'sost';

export const THEME_STORAGE_KEY = 'gelbcrm_theme_preset';

export const THEME_PRESETS: Record<ThemePresetKey, { label: string }> = {
  sost: {
    label: 'Sost'
  }
};

export const THEME_PRESET_OPTIONS = Object.entries(THEME_PRESETS).map(([value, preset]) => ({
  value: value as ThemePresetKey,
  label: preset.label
}));
