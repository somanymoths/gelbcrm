'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import { THEME_PRESETS, THEME_STORAGE_KEY, type ThemePresetKey } from '@/lib/ui/theme-presets';

type ThemePresetContextValue = {
  preset: ThemePresetKey;
  setPreset: (value: ThemePresetKey) => void;
};

const ThemePresetContext = createContext<ThemePresetContextValue>({
  preset: 'sost',
  setPreset: () => {}
});

export function useThemePreset() {
  return useContext(ThemePresetContext);
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [preset, setPresetState] = useState<ThemePresetKey>('sost');

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && stored in THEME_PRESETS) {
      setPresetState(stored as ThemePresetKey);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, preset);
    document.documentElement.setAttribute('data-theme-preset', preset);
  }, [preset]);

  const value = useMemo(
    () => ({
      preset,
      setPreset: setPresetState
    }),
    [preset]
  );

  return (
    <ThemePresetContext.Provider value={value}>
      <ConfigProvider theme={THEME_PRESETS[preset].theme}>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemePresetContext.Provider>
  );
}
