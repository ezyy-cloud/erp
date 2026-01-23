import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase/client';

type Theme = 'light' | 'dark';
type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => Promise<void>;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Get effective theme from preference
const getEffectiveTheme = (preference: ThemePreference): Theme => {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, appUser } = useAuth();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => {
    // Check localStorage first for immediate UI (before auth loads)
    const stored = localStorage.getItem('theme_preference') as ThemePreference | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  });
  const [theme, setTheme] = useState<Theme>(() => getEffectiveTheme(themePreference));
  const [isLoading, setIsLoading] = useState(true);

  // Load theme preference from database when user is authenticated
  useEffect(() => {
    if (!user || !appUser) {
      setIsLoading(false);
      return;
    }

    const loadThemePreference = async () => {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .select('theme_preference')
          .eq('id', user.id)
          .single();

        if (!error && data?.theme_preference) {
          const preference = data.theme_preference as ThemePreference;
          setThemePreferenceState(preference);
          setTheme(getEffectiveTheme(preference));
          localStorage.setItem('theme_preference', preference);
        }
      } catch (error) {
        console.error('Error loading theme preference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemePreference();
  }, [user, appUser]);

  // Apply theme to document
  useEffect(() => {
    const effectiveTheme = getEffectiveTheme(themePreference);
    setTheme(effectiveTheme);
    
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [themePreference]);

  // Listen for system theme changes when preference is 'system'
  useEffect(() => {
    if (themePreference !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setTheme(getEffectiveTheme(themePreference));
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themePreference]);

  // Update theme preference in database
  const setThemePreference = useCallback(async (preference: ThemePreference) => {
    setThemePreferenceState(preference);
    localStorage.setItem('theme_preference', preference);

    // Update in database if user is authenticated
    if (user) {
      try {
        const { error } = await (supabase.from('users') as any)
          .update({ theme_preference: preference })
          .eq('id', user.id);

        if (error) {
          console.error('Error updating theme preference:', error);
          // Revert on error
          const previous = localStorage.getItem('theme_preference') as ThemePreference | null;
          if (previous) {
            setThemePreferenceState(previous);
          }
        }
      } catch (error) {
        console.error('Error updating theme preference:', error);
      }
    }
  }, [user]);

  const toggleTheme = useCallback(() => {
    // Toggle between light and dark (skip system for toggle)
    const newPreference = theme === 'light' ? 'dark' : 'light';
    setThemePreference(newPreference);
  }, [theme, setThemePreference]);

  // Don't render children until theme is loaded for authenticated users (prevents flicker)
  // For unauthenticated users, render immediately with localStorage/default theme
  if (isLoading && user) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, themePreference, setThemePreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
