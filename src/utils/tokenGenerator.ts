/**
 * Takeaway Token Generation Utility
 * Format: T### (e.g., T001, T042, T153)
 * Daily reset at midnight
 */

export interface TokenInfo {
    token: string;
    tokenDate: string;
    estimatedReadyTime: Date;
}

/**
 * Generate next token number for takeaway orders
 * @param existingTokens - Array of existing token numbers for today
 * @returns Next token in format T###
 */
export const generateNextToken = (existingTokens: string[]): string => {
    // Extract numbers from tokens like "T001", "T042"
    const numbers = existingTokens
        .map(token => {
            const match = token.match(/T(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

    const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNumber = maxNumber + 1;

    // Format as T### with leading zeros
    return `T${String(nextNumber).padStart(3, '0')}`;
};

/**
 * Get current date string for token tracking (YYYY-MM-DD)
 */
export const getCurrentTokenDate = (): string => {
    return new Date().toISOString().split('T')[0]; // "2026-02-02"
};

/**
 * Calculate estimated pickup time based on order complexity
 * @param itemCount - Number of items in order
 * @returns Estimated ready time
 */
export const calculatePickupTime = (itemCount: number): Date => {
    // Base time: 10 minutes
    // + 2 minutes per item
    // Min: 10 minutes, Max: 30 minutes

    const baseMinutes = 10;
    const perItemMinutes = 2;
    const maxMinutes = 30;

    const totalMinutes = Math.min(
        baseMinutes + (itemCount * perItemMinutes),
        maxMinutes
    );

    const readyTime = new Date();
    readyTime.setMinutes(readyTime.getMinutes() + totalMinutes);

    return readyTime;
};

/**
 * Format time for display (e.g., "3:45 PM")
 */
export const formatPickupTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
};

/**
 * Check if a token is for today
 */
export const isTokenToday = (tokenDate: string): boolean => {
    return tokenDate === getCurrentTokenDate();
};

/**
 * Get display-friendly token format with spacing
 * @param token - Token like "T042"
 * @returns Spaced format like "T 0 4 2"
 */
export const formatTokenDisplay = (token: string): string => {
    // Transform "T042" to "T 0 4 2" for large display
    if (!token || !token.startsWith('T')) return token;

    const number = token.substring(1); // "042"
    return `T ${number.split('').join(' ')}`; // "T 0 4 2"
};
