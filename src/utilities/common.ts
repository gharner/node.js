import * as Sentry from '@sentry/google-cloud-serverless';

// Initialize Sentry for error tracking
Sentry.init({
	dsn: 'https://3bc129af82c1d7ef8f769984a04535df@o4508904065204224.ingest.us.sentry.io/4508989823451136',
	tracesSampleRate: 1.0, // Adjust based on needs
});

/**
 * Handles errors by logging to Firebase and capturing them in Sentry.
 * @param error The error object
 * @param response Optional Express response object
 */
/* export function handleError(error: Error, response?: Response) {
	// Capture error in Sentry
	Sentry.captureException(error);

	// Log error details in Firebase logs
	logger.error(`Error: ${error.message}`);
	logger.error(`Stack Trace: ${error.stack}`);

	// Send response if available
	if (response) {
		response.status(500).send({ error: error.message });
	}
} */

export function safeStringify(obj: any, space: number = 2): string {
	const cache = new Set();
	return JSON.stringify(
		obj,
		function (key, value) {
			if (typeof value === 'object' && value !== null) {
				if (cache.has(value)) {
					// Circular reference found, discard key
					return;
				}
				// Store value in the cache
				cache.add(value);
			}
			return value;
		},
		space
	);
}
