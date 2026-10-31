import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { User, View } from '../../types';
import { Sidebar } from './Sidebar';

interface MobileNavigationProps {
    open: boolean;
    onClose: () => void;
    currentView: View;
    setCurrentView: (view: View) => void;
    currentUser: User;
    onLogout: () => void;
}

export function MobileNavigation({ open, onClose, ...sidebarProps }: MobileNavigationProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (open && !dialog?.open) dialog?.showModal();
        if (!open && dialog?.open) dialog.close();
    }, [open]);

    useEffect(() => {
        const desktop = window.matchMedia('(min-width: 1024px)');
        const closeOnDesktop = () => { if (desktop.matches) onClose(); };
        desktop.addEventListener('change', closeOnDesktop);
        return () => desktop.removeEventListener('change', closeOnDesktop);
    }, [onClose]);

    return (
        <dialog
            id="mobile-navigation"
            ref={dialogRef}
            aria-label="Navigation menu"
            className="mobile-navigation"
            onClose={onClose}
            onClick={event => { if (event.target === event.currentTarget) onClose(); }}
        >
            <button aria-label="Close navigation menu" onClick={onClose}
                className="absolute right-2 top-4 z-10 p-3 rounded-lg text-slate-400 hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-400">
                <X size={20} />
            </button>
            <Sidebar {...sidebarProps} className="!w-full" />
        </dialog>
    );
}
