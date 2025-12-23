/**
 * Fortress Notification Service
 * Handles toast notifications and alerts throughout the application.
 */

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message?: string;
    duration?: number;
    timestamp: number;
}

// In-memory store for notifications
let notifications: Notification[] = [];
let listeners: ((notifications: Notification[]) => void)[] = [];

/**
 * Subscribe to notification changes
 */
export const subscribeToNotifications = (listener: (notifications: Notification[]) => void): (() => void) => {
    listeners.push(listener);
    return () => {
        listeners = listeners.filter(l => l !== listener);
    };
};

/**
 * Notify all listeners of changes
 */
const notifyListeners = () => {
    listeners.forEach(listener => listener([...notifications]));
};

/**
 * Add a new notification
 */
export const addNotification = (
    type: NotificationType,
    title: string,
    message?: string,
    duration: number = 5000
): string => {
    const id = crypto.randomUUID();
    const notification: Notification = {
        id,
        type,
        title,
        message,
        duration,
        timestamp: Date.now()
    };

    notifications = [...notifications, notification];
    notifyListeners();

    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeNotification(id);
        }, duration);
    }

    return id;
};

/**
 * Remove a notification by ID
 */
export const removeNotification = (id: string): void => {
    notifications = notifications.filter(n => n.id !== id);
    notifyListeners();
};

/**
 * Clear all notifications
 */
export const clearAllNotifications = (): void => {
    notifications = [];
    notifyListeners();
};

/**
 * Get all current notifications
 */
export const getNotifications = (): Notification[] => {
    return [...notifications];
};

// Convenience functions
export const toast = {
    success: (title: string, message?: string, duration?: number) =>
        addNotification('success', title, message, duration),

    error: (title: string, message?: string, duration?: number) =>
        addNotification('error', title, message, duration || 8000),

    warning: (title: string, message?: string, duration?: number) =>
        addNotification('warning', title, message, duration),

    info: (title: string, message?: string, duration?: number) =>
        addNotification('info', title, message, duration),
};

/**
 * React hook for using notifications (can be used in components)
 */
export const useNotificationsHook = () => {
    // This would be implemented with React hooks in an actual component
    // For now, return the basic functions
    return {
        notifications: getNotifications(),
        toast,
        remove: removeNotification,
        clearAll: clearAllNotifications
    };
};
