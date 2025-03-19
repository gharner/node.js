import { admin } from '../middleware/firebase';
import * as functions from 'firebase-functions';
import { EmailMessage } from '../interfaces/common';
import { Response } from 'express';

const logger = functions.logger;

export async function handleError(error: Error, response?: Response) {
	const serializedError = serializeError(error);

	if (error instanceof CustomError && error.additionalInfo) {
		if (typeof error.additionalInfo === 'string') {
		} else {
			try {
				const parsedAdditionalInfo = safeStringify(error.additionalInfo, 2);

				logger.log({ Additional_Info: JSON.parse(parsedAdditionalInfo) });
			} catch (e) {
				logger.log({ Additional_Info: error.additionalInfo });
			}
		}
	}

	const messageText = `
        <p><strong>Error Name:</strong> ${error.name}</p>
        <p><strong>Error Message:</strong> ${error.message}</p>
        <p><strong>Serialized Error:</strong><br>${safeStringify(serializedError, 2).replace(/\n/g, '<br>')}</p>
    `;

	const emailMessage = {
		to: 'gh@yongsa.net',
		message: {
			subject: error instanceof CustomError && error.customProperty ? error.customProperty : 'Firebase Functions Error',
			html: messageText,
		},
	};

	await sendErrorEmail(emailMessage);

	if (error instanceof CustomError) {
		if (error.customProperty) {
			logger.info(error.customProperty);
		} else {
			logger.info('no custom property');
		}
	} else {
		// Handle generic error
		logger.error(`Generic Error: ${error.message}`);
		logger.error(serializedError);
	}

	if (response) {
		response.status(500).send({ error: serializedError });
	}
}
export async function sendErrorEmail(emailMessage: EmailMessage) {
	try {
		const docRef = await admin.firestore().collection('mas-email').add({ to: emailMessage.to, message: emailMessage.message });
		logger.info('Document written to mas-email with ID: ', docRef.id);
	} catch (error) {
		logger.error('Failed to send error email: ', error);
	}
}

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
