// functions/src/utilites/common.ts

import { admin } from '../middleware/firebase';
import * as functions from 'firebase-functions';
import { EmailMessage } from '../interfaces/common';
import { Response } from 'express';

const logger = functions.logger;
export async function handleError(error: unknown, funcName: string, response?: Response): Promise<void> {
	try {
		if (error instanceof Error) {
			const serializedError = serializeError(error);
			const messageText = safeStringify(serializedError, 2).replace(/\n/g, '<br>');

			const emailMessage = {
				to: 'gh@yongsa.net',
				message: {
					subject: funcName,
					html: `<p>${messageText}</p>`,
				},
			};

			await sendErrorEmail(emailMessage);

			if (response) {
				response.status(500).send({ error: error.message });
			}
		} else {
			const unknownError = safeStringify(error, 2).replace(/\n/g, '<br>');
			logger.error(`Unknown error in function ${funcName}:`, unknownError);

			if (response) {
				response.status(500).send({ error: 'Internal Server Error' });
			}
		}
	} catch (sendError) {
		logger.error(`Failed to handle error in function ${funcName}:`, sendError);
		if (response) {
			response.status(500).send({ error: 'Internal Server Error' });
		}
	}
}

export async function sendErrorEmail(emailMessage: EmailMessage) {
	try {
		const docRef = await admin.firestore().collection('mas-email').add({ to: emailMessage.to, message: emailMessage.message });
		logger.info('Document written with ID: ', docRef.id);
	} catch (error) {
		logger.error('Failed to send error email: ', error);
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

export function serializeError(error: Error): object {
	const serialized: any = {
		message: error.message,
		name: error.name,
		stack: error.stack ? error.stack.replace(/\n/g, '<br>') : '',
	};

	// Add any additional custom properties
	for (const key of Object.keys(error)) {
		serialized[key] = (error as any)[key];
	}

	// Handle known custom properties if the error is a CustomError
	if (error instanceof CustomError) {
		serialized.customProperty = error.customProperty;
		serialized.additionalInfo = error.additionalInfo;
	}

	return serialized;
}

export class CustomError extends Error {
	constructor(message: string, public customProperty: string, public additionalInfo?: any) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}
}
