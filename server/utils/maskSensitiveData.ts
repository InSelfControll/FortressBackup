/**
 * Utility to mask sensitive data in log messages
 */

// Patterns that indicate sensitive data follows
const SENSITIVE_PATTERNS = [
    // Password patterns
    /BORG_PASSPHRASE=[^\s]+/gi,
    /RESTIC_PASSWORD=[^\s]+/gi,
    /password\s*=\s*['"]?[^\s'"]+['"]?/gi,
    /--password[=\s]+['"]?[^\s'"]+['"]?/gi,
    /-p\s+['"]?[^\s'"]+['"]?/gi,

    // Key patterns  
    /private[\s_-]?key[\s:=]+[^\n]+/gi,
    /secret[\s_-]?key[\s:=]+['"]?[^\s'"]+['"]?/gi,
    /access[\s_-]?key[\s:=]+['"]?[^\s'"]+['"]?/gi,
    /api[\s_-]?key[\s:=]+['"]?[^\s'"]+['"]?/gi,

    // Token patterns
    /token[\s:=]+['"]?[^\s'"]{20,}['"]?/gi,
    /bearer\s+[^\s]+/gi,

    // AWS/Cloud credentials
    /AWS_SECRET_ACCESS_KEY=[^\s]+/gi,
    /AWS_ACCESS_KEY_ID=[^\s]+/gi,
];

/**
 * Mask sensitive data in a log message
 */
export function maskSensitiveData(message: string): string {
    let masked = message;

    for (const pattern of SENSITIVE_PATTERNS) {
        masked = masked.replace(pattern, (match) => {
            // Keep the key part, mask the value
            const eqIndex = match.indexOf('=');
            const colonIndex = match.indexOf(':');
            const spaceIndex = match.indexOf(' ');

            // Find the separator
            let separatorIndex = -1;
            if (eqIndex > 0) separatorIndex = eqIndex;
            else if (colonIndex > 0) separatorIndex = colonIndex;
            else if (spaceIndex > 0 && match.toLowerCase().includes('bearer')) separatorIndex = spaceIndex;

            if (separatorIndex > 0) {
                const key = match.substring(0, separatorIndex + 1);
                return key + '********';
            }

            return '********';
        });
    }

    return masked;
}

/**
 * Check if a message contains sensitive data
 */
export function containsSensitiveData(message: string): boolean {
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
}
