import * as Sentry from '@sentry/node';
import { NextFunction, Request, Response } from 'express';
import { CustomError, logWithTime, safeStringify } from '../modules'; // adjust path as needed

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
	// Capture with Sentry
	Sentry.captureException(err);

	// Handle known CustomError
	if (err instanceof CustomError) {
		try {
			const parsedInfo = typeof err.additionalInfo === 'string' ? err.additionalInfo : JSON.parse(safeStringify(err.additionalInfo, 2));

			logWithTime('CustomError', parsedInfo);
		} catch {
			logWithTime('CustomError', err.additionalInfo);
		}

		res.status(500).json({ error: err.serializeError() });
		return;
	}

	// Handle unknown errors
	logWithTime('UnhandledError', err);
	res.status(500).json({ error: { message: 'Internal Server Error' } });
	return;
}
