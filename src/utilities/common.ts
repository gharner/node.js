import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { emailMessage as EmailMessage } from '../interfaces/common';

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
