import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { EmailMessage } from '../interfaces/common';
import { Response } from 'express';

export async function handleError(error: unknown, funcName: string, response?: Response): Promise<void> {
	if (error instanceof Error) {
		const serializedError = serializeError(error);
		const messageText = safeStringify(serializedError, 2);

		const emailMessage = {
			to: 'gh@yongsa.net',
			message: { subject: funcName, text: messageText },
		};

		await sendErrorEmail(emailMessage);

		if (response) response.status(500).send({ error: error.message });
	} else {
		functions.logger.error('Unknown error:', safeStringify(error, 2));
		if (response) response.status(500).send({ error: 'Internal Server Error' });
	}
}

export async function sendErrorEmail(emailMessage: EmailMessage) {
	try {
		await admin.firestore().collection('mas-email').add({ emailMessage });
	} catch (error) {
		functions.logger.error('Failed to send error email: ', error);
	}
}
export function safeStringify(obj: any, space: number): string {
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

function serializeError(error: Error): object {
	const serialized: any = {
		message: error.message,
		name: error.name,
		stack: error.stack,
	};

	// Add any additional custom properties
	for (const key of Object.keys(error)) {
		serialized[key] = (error as any)[key];
	}

	return serialized;
}
