import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface UserPreferences {
    // Notifications
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    notificationPosition: 'top-right' | 'bottom-right' | 'bottom-left';

    // Display
    compactMode: boolean;
    showBreadcrumbs: boolean;
    animationsEnabled: boolean;

    // Behavior
    autoRefresh: boolean;
    refreshInterval: number; // in seconds
    defaultOrderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

    // Kitchen Display
    kdsAutoAdvance: boolean;
    kdsColumns: number;
}

const DEFAULT_PREFERENCES: UserPreferences = {
    notificationsEnabled: true,
    soundEnabled: true,
    notificationPosition: 'bottom-right',
    compactMode: false,
    showBreadcrumbs: true,
    animationsEnabled: true,
    autoRefresh: true,
    refreshInterval: 30,
    defaultOrderType: 'DINE_IN',
    kdsAutoAdvance: false,
    kdsColumns: 3,
};

interface PreferencesContextType {
    preferences: UserPreferences;
    updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
    resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const usePreferences = () => {
    const context = useContext(PreferencesContext);
    if (!context) {
        throw new Error('usePreferences must be used within PreferencesProvider');
    }
    return context;
};

export const PreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [preferences, setPreferences] = useState<UserPreferences>(() => {
        const saved = localStorage.getItem('user_preferences');
        if (saved) {
            try {
                return { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) };
            } catch {
                return DEFAULT_PREFERENCES;
            }
        }
        return DEFAULT_PREFERENCES;
    });

    useEffect(() => {
        localStorage.setItem('user_preferences', JSON.stringify(preferences));
    }, [preferences]);

    const updatePreference = <K extends keyof UserPreferences>(
        key: K,
        value: UserPreferences[K]
    ) => {
        setPreferences((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const resetPreferences = () => {
        setPreferences(DEFAULT_PREFERENCES);
    };

    return (
        <PreferencesContext.Provider value={{ preferences, updatePreference, resetPreferences }}>
            {children}
        </PreferencesContext.Provider>
    );
};
