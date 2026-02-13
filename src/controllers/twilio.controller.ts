import crypto from 'crypto';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v1';
import { admin, CustomError, logWithTime, safeStringify } from '../modules';

type TwilioInboundPayload = {
	From?: string;
	To?: string;
	Body?: string;
	SmsSid?: string;
	MessageSid?: string;
	NumMedia?: string;
	[key: string]: any;
};

const STOP_KEYWORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);
const START_KEYWORDS = new Set(['start', 'yes', 'unstop']);

export const inboundSmsWebhook = async (request: Request, response: Response) => {
	try {
		if (request.method !== 'POST') {
			response.status(405).send('Method Not Allowed');
			return;
		}

		// Twilio posts application/x-www-form-urlencoded. With Express urlencoded enabled, this will be an object.
		const payload: TwilioInboundPayload = (request.body ?? {}) as TwilioInboundPayload;

		// Optional signature validation (recommended in production)
		const authToken = process.env.TWILIO_AUTH_TOKEN;
		const signature = (request.header('X-Twilio-Signature') || '').trim();

		if (authToken && signature) {
			const url = getPublicUrl(request);
			const isValid = validateTwilioSignature(authToken, signature, url, payload);
			if (!isValid) {
				logger.warn('Invalid Twilio signature', { url });
				response.status(403).send('Forbidden');
				return;
			}
		} else {
			// If you haven't set TWILIO_AUTH_TOKEN yet, you can still run the webhook,
			// but signature validation will be skipped.
			if (process.env.FUNCTIONS_EMULATOR) {
				logger.log('Twilio signature validation skipped (missing TWILIO_AUTH_TOKEN or signature header).');
			}
		}

		const from = (payload.From || '').trim();
		const to = (payload.To || '').trim();
		const bodyRaw = (payload.Body || '').toString();
		const body = bodyRaw.trim();
		const normalized = body.toLowerCase();

		if (!from) {
			response.status(400).send('Missing From');
			return;
		}

		if (process.env.FUNCTIONS_EMULATOR) {
			logger.log(`twilio inbound from=${from} to=${to} body=${body}`);
			logger.log(`payload=${safeStringify(payload, 2)}`);
		}

		// Always store inbound message (optional but useful for audit/debugging)
		await admin
			.firestore()
			.collection('sms_inbound')
			.add({
				from,
				to,
				body,
				normalized,
				smsSid: payload.SmsSid || null,
				messageSid: payload.MessageSid || null,
				raw: payload,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
			});

		// Record STOP / START style keywords for your own visibility
		if (STOP_KEYWORDS.has(normalized)) {
			await admin.firestore().collection('sms_opt_outs').doc(from).set(
				{
					phoneNumber: from,
					to,
					keyword: body,
					status: 'opted_out',
					source: 'twilio_inbound_webhook',
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);

			logWithTime('twilioInboundWebhook=>optOut', { from, keyword: body });
		}

		if (START_KEYWORDS.has(normalized)) {
			await admin.firestore().collection('sms_opt_outs').doc(from).set(
				{
					phoneNumber: from,
					to,
					keyword: body,
					status: 'resubscribe_requested',
					source: 'twilio_inbound_webhook',
					updatedAt: admin.firestore.FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);

			logWithTime('twilioInboundWebhook=>resubscribeRequested', { from, keyword: body });
		}

		// Return empty TwiML so Twilio is happy.
		response.status(200).set('Content-Type', 'text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			method: request.method,
			headers: request.headers,
			body: request.body,
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error inboundSmsWebhook:', additionalInfo);

		throw new CustomError('Failed inboundSmsWebhook', 'controller=>twilio=>inboundSmsWebhook', additionalInfo);
	}
};

function getPublicUrl(req: Request): string {
	const proto = (req.header('x-forwarded-proto') || 'https').split(',')[0].trim();
	const host = (req.header('x-forwarded-host') || req.header('host') || '').split(',')[0].trim();
	const originalUrl = (req.originalUrl || req.url || '').toString();
	return `${proto}://${host}${originalUrl}`;
}

/**
 * Twilio signature validation (no external dependency):
 * base64( HMAC-SHA1( authToken, url + concat(sorted(params)) ) )
 */
function validateTwilioSignature(authToken: string, twilioSignature: string, url: string, params: Record<string, any>): boolean {
	// Twilio concatenation: URL + each param name + value, sorted by param name
	const sortedKeys = Object.keys(params || {}).sort();
	let data = url;

	for (const key of sortedKeys) {
		const value = params[key];
		if (value === undefined || value === null) continue;
		data += key + value.toString();
	}

	const computed = crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');

	// Best option: compare decoded signature bytes using timingSafeEqual, with TS-friendly Uint8Array
	try {
		const a = Uint8Array.from(Buffer.from(computed, 'base64'));
		const b = Uint8Array.from(Buffer.from(twilioSignature, 'base64'));
		return a.length === b.length && crypto.timingSafeEqual(a, b);
	} catch {
		return false;
	}
}
