import { theme } from 'antd';
import type { ThemeConfig } from 'antd';

export type ThemePresetKey = 'sost';

export const THEME_STORAGE_KEY = 'gelbcrm_theme_preset';

export const THEME_PRESETS: Record<ThemePresetKey, { label: string; theme: ThemeConfig }> = {
  sost: {
    label: 'Sost',
    theme: {
      algorithm: theme.defaultAlgorithm,
      token: {
        colorPrimary: '#2563eb',
        colorInfo: '#2563eb',
        colorBgLayout: '#f6f8ff',
        colorBgContainer: '#ffffff',
        colorBorder: '#dbeafe',
        borderRadius: 14,
        fontFamily: "'Manrope', 'Segoe UI', sans-serif"
      },
      components: {
        Layout: {
          headerBg: '#f8fbff',
          bodyBg: '#f6f8ff',
          siderBg: '#f8fbff'
        },
        Card: {
          borderRadiusLG: 14
        }
      }
    }
  }
};

export const THEME_PRESET_OPTIONS = Object.entries(THEME_PRESETS).map(([value, preset]) => ({
  value: value as ThemePresetKey,
  label: preset.label
}));
