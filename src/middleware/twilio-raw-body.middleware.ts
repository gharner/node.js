import Express from 'express';

/**
 * Twilio signature validation requires the exact raw request body.
 * This middleware captures rawBody before JSON parsing mutates it.
 *
 * Use it ONLY for Twilio webhook routes.
 */
export const twilioRawBody = Express.raw({
	type: '*/*',
	limit: '1mb',
});
