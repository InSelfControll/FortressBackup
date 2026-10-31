import React from 'react';
import { View } from '../../types';
import { Menu, Search, Settings } from 'lucide-react';

interface HeaderProps {
    currentView: View;
    setCurrentView: (view: View) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onOpenNavigation?: () => void;
    navigationOpen?: boolean;
    showSettings?: boolean;
    showSearch?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, searchQuery, setSearchQuery, onOpenNavigation, navigationOpen = false, showSettings = true, showSearch = true }) => {
    return (
        <header className="px-4 sm:px-6 py-3 sm:py-4 shrink-0 flex flex-wrap justify-between items-center gap-3" style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <div className="flex min-w-0 items-center gap-2">
                <button onClick={onOpenNavigation} aria-label="Open navigation menu" aria-expanded={navigationOpen} aria-controls="mobile-navigation"
                    className="lg:hidden p-3 -ml-2 rounded-lg text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-400"><Menu size={22} /></button>
                <h1 className="text-lg font-semibold capitalize" style={{ color: 'var(--color-text-primary)' }}>{currentView.replaceAll('-', ' ')}</h1>
            </div>
            <div className="flex w-full sm:w-auto items-center gap-3">
                {showSearch && <div className="relative min-w-0 flex-1 sm:flex-none">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'var(--color-text-muted)' }} />
                    <input
                        type="text"
                        placeholder={currentView === 'dashboard' ? 'Search recent jobs...' : 'Search...'}
                        aria-label="Search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-lg text-sm outline-none focus:ring-2 w-full sm:w-56"
                        style={{
                            backgroundColor: 'var(--color-bg-tertiary)',
                            border: '1px solid var(--color-border-default)',
                            color: 'var(--color-text-primary)',
                        }}
                    />
                </div>}
                {showSettings && <button
                    onClick={() => setCurrentView('settings')}
                    aria-label="Settings"
                    className="p-3 shrink-0 rounded-lg transition-colors"
                    style={{
                        backgroundColor: currentView === 'settings' ? 'var(--color-accent-subtle)' : 'var(--color-bg-tertiary)',
                        color: currentView === 'settings' ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-default)'
                    }}
                >
                    <Settings size={18} />
                </button>}
            </div>
        </header>
    );
};
