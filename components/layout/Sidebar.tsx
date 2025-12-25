import React from 'react';
import { View, User } from '../../types';
import { Layout, LayoutDashboard, Server, HardDrive, Settings, LogOut, ShieldCheck } from 'lucide-react';

interface SidebarProps {
    currentView: View;
    setCurrentView: (view: View) => void;
    currentUser: User | null;
    onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, currentUser, onLogout }) => {
    if (!currentUser) return null;

    return (
        <aside className="w-64 flex flex-col" style={{ backgroundColor: 'var(--color-bg-secondary)', borderRight: '1px solid var(--color-border-subtle)' }}>
            {/* Logo */}
            <div className="p-5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-accent-primary)' }}>
                    <ShieldCheck size={22} className="text-white" />
                </div>
                <div>
                    <span className="font-bold text-lg" style={{ color: 'var(--color-text-primary)' }}>Fortress</span>
                    <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>Backup Manager</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1">
                {[
                    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                    { id: 'jobs', label: 'Backup Jobs', icon: Layout },
                    { id: 'systems', label: 'Systems', icon: Server },
                    { id: 'locations', label: 'Storage Locations', icon: HardDrive },
                    { id: 'settings', label: 'Settings', icon: Settings },
                ].map((item) => {
                    const Icon = item.icon;
                    const active = currentView === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setCurrentView(item.id as View)}
                            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors`}
                            style={{
                                backgroundColor: active ? 'var(--color-accent-subtle)' : 'transparent',
                                color: active ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                                fontWeight: active ? 600 : 400,
                            }}
                        >
                            <Icon size={18} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* User Profile */}
            <div className="p-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <div className="flex items-center gap-3 mb-3">
                    <img src={currentUser.avatar} alt="User" className="w-9 h-9 rounded-full" style={{ border: '2px solid var(--color-border-default)' }} />
                    <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{currentUser.name}</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{currentUser.role}</p>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-default)' }}
                >
                    <LogOut size={14} />
                    Sign Out
                </button>
            </div>
        </aside>
    );
};
