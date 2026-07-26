export function normalizeConvexError(error) {
    if (error instanceof Error) {
        return {
            code: 'CLIENT_ERROR',
            message: error.message,
            cause: error,
        };
    }
    return {
        code: 'UNKNOWN_ERROR',
        message: 'Unknown Convex error',
        cause: error,
    };
}
