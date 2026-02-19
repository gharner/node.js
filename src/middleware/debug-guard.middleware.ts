import { NextFunction, Request, Response } from 'express';
import { defineSecret } from 'firebase-functions/params';

/**
 * Optional debug key for protected internal endpoints.
 * Only required if you want access outside emulator.
 */
const DEBUG_KEY = defineSecret('MAS_DEBUG_KEY');

/**
 * Debug endpoints should never be open in production.
 *
 * Rules:
 * - Emulator: always allowed
 * - Production: must include x-debug-key header
 */
export const debugGuard = (req: Request, res: Response, next: NextFunction) => {
	const isEmulator = !!process.env.FUNCTIONS_EMULATOR;

	if (isEmulator) {
		return next();
	}

	const key = req.headers['x-debug-key'];

	if (!key || key !== DEBUG_KEY.value()) {
		res.status(403).send('Forbidden');
		return;
	}

	next();
};
