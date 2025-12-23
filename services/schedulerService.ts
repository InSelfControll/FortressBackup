/**
 * Fortress Scheduler Service
 * Parses and validates cron expressions, calculates next run times.
 */

export interface CronParts {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
}

/**
 * Parse a cron expression into its component parts
 */
export const parseCron = (cron: string): CronParts | null => {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    return {
        minute: parts[0],
        hour: parts[1],
        dayOfMonth: parts[2],
        month: parts[3],
        dayOfWeek: parts[4]
    };
};

/**
 * Validate a cron expression
 */
export const validateCron = (cron: string): { valid: boolean; error?: string } => {
    const parts = parseCron(cron);
    if (!parts) {
        return { valid: false, error: 'Cron expression must have exactly 5 fields' };
    }

    const validators: Record<keyof CronParts, { min: number; max: number; name: string }> = {
        minute: { min: 0, max: 59, name: 'Minute' },
        hour: { min: 0, max: 23, name: 'Hour' },
        dayOfMonth: { min: 1, max: 31, name: 'Day of month' },
        month: { min: 1, max: 12, name: 'Month' },
        dayOfWeek: { min: 0, max: 7, name: 'Day of week' }
    };

    for (const [key, config] of Object.entries(validators)) {
        const value = parts[key as keyof CronParts];
        if (value !== '*') {
            // Handle ranges (e.g., 1-5)
            if (value.includes('-')) {
                const [start, end] = value.split('-').map(Number);
                if (isNaN(start) || isNaN(end) || start < config.min || end > config.max) {
                    return { valid: false, error: `Invalid range for ${config.name}` };
                }
            }
            // Handle steps (e.g., */5)
            else if (value.includes('/')) {
                const [, step] = value.split('/');
                if (isNaN(Number(step)) || Number(step) < 1) {
                    return { valid: false, error: `Invalid step for ${config.name}` };
                }
            }
            // Handle lists (e.g., 1,2,3)
            else if (value.includes(',')) {
                const nums = value.split(',').map(Number);
                if (nums.some(n => isNaN(n) || n < config.min || n > config.max)) {
                    return { valid: false, error: `Invalid list for ${config.name}` };
                }
            }
            // Handle simple numbers
            else {
                const num = Number(value);
                if (isNaN(num) || num < config.min || num > config.max) {
                    return { valid: false, error: `${config.name} must be between ${config.min} and ${config.max}` };
                }
            }
        }
    }

    return { valid: true };
};

/**
 * Convert cron expression to human-readable format
 */
export const cronToHuman = (cron: string): string => {
    const parts = parseCron(cron);
    if (!parts) return cron;

    const { minute, hour, dayOfMonth, month, dayOfWeek } = parts;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Every minute
    if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        return 'Every minute';
    }

    // Every N minutes
    if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        const interval = minute.split('/')[1];
        return `Every ${interval} minutes`;
    }

    // Daily at specific time
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        const h = hour === '*' ? 'every hour' : hour.padStart(2, '0');
        const m = minute === '*' ? '00' : minute.padStart(2, '0');
        if (hour !== '*') {
            return `Daily at ${h}:${m}`;
        }
        return `At minute ${m} of every hour`;
    }

    // Weekly on specific day
    if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
        const h = hour === '*' ? '00' : hour.padStart(2, '0');
        const m = minute === '*' ? '00' : minute.padStart(2, '0');
        const days = dayOfWeek.split(',').map(d => dayNames[parseInt(d)] || d).join(', ');
        return `${days} at ${h}:${m}`;
    }

    // Monthly on specific day
    if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
        const h = hour === '*' ? '00' : hour.padStart(2, '0');
        const m = minute === '*' ? '00' : minute.padStart(2, '0');
        return `Monthly on day ${dayOfMonth} at ${h}:${m}`;
    }

    // Yearly on specific date
    if (dayOfMonth !== '*' && month !== '*' && dayOfWeek === '*') {
        const h = hour === '*' ? '00' : hour.padStart(2, '0');
        const m = minute === '*' ? '00' : minute.padStart(2, '0');
        return `Yearly on ${monthNames[parseInt(month) - 1]} ${dayOfMonth} at ${h}:${m}`;
    }

    // Default: return the raw cron
    return cron;
};

/**
 * Calculate the next run time for a cron expression
 * This is a simplified implementation - for production, use a library like croner
 */
export const getNextRunTime = (cron: string, from: Date = new Date()): Date | null => {
    const parts = parseCron(cron);
    if (!parts) return null;

    const { minute, hour, dayOfMonth, month, dayOfWeek } = parts;
    const next = new Date(from);
    next.setSeconds(0);
    next.setMilliseconds(0);

    // Simple case: specific time daily
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        next.setMinutes(parseInt(minute));
        next.setHours(parseInt(hour));
        if (next <= from) {
            next.setDate(next.getDate() + 1);
        }
        return next;
    }

    // For complex expressions, add a small offset as placeholder
    // In production, use a proper cron library
    next.setHours(next.getHours() + 1);
    return next;
};

/**
 * Common cron presets for easy selection
 */
export const CRON_PRESETS = [
    { label: 'Every Minute', cron: '* * * * *' },
    { label: 'Every 5 Minutes', cron: '*/5 * * * *' },
    { label: 'Every 15 Minutes', cron: '*/15 * * * *' },
    { label: 'Every Hour', cron: '0 * * * *' },
    { label: 'Every 6 Hours', cron: '0 */6 * * *' },
    { label: 'Daily at Midnight', cron: '0 0 * * *' },
    { label: 'Daily at 2 AM', cron: '0 2 * * *' },
    { label: 'Daily at 6 AM', cron: '0 6 * * *' },
    { label: 'Weekly on Sunday', cron: '0 0 * * 0' },
    { label: 'Monthly on 1st', cron: '0 0 1 * *' },
];
