import React from 'react';
import { View } from '../../types';
import { Search, Settings } from 'lucide-react';

interface HeaderProps {
    currentView: View;
    setCurrentView: (view: View) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, searchQuery, setSearchQuery }) => {
    return (
        <header className="px-6 py-4 flex justify-between items-center" style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <h1 className="text-lg font-semibold capitalize" style={{ color: 'var(--color-text-primary)' }}>{currentView}</h1>
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: 'var(--color-text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-lg text-sm outline-none focus:ring-2 w-56"
                        style={{
                            backgroundColor: 'var(--color-bg-tertiary)',
                            border: '1px solid var(--color-border-default)',
                            color: 'var(--color-text-primary)',
                        }}
                    />
                </div>
                <button
                    onClick={() => setCurrentView('settings')}
                    className="p-2 rounded-lg transition-colors"
                    style={{
                        backgroundColor: currentView === 'settings' ? 'var(--color-accent-subtle)' : 'var(--color-bg-tertiary)',
                        color: currentView === 'settings' ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-default)'
                    }}
                >
                    <Settings size={18} />
                </button>
            </div>
        </header>
    );
};
