import { Request, Response } from 'express';
import * as functions from 'firebase-functions/v1';
import { logger } from 'firebase-functions/v1';
import twilio from 'twilio';
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

/**
 * If you want signature validation while testing locally, set:
 * TWILIO_VALIDATE_SIGNATURE_IN_EMULATOR=true
 */
const SHOULD_VALIDATE_SIGNATURE_IN_EMULATOR = (process.env.TWILIO_VALIDATE_SIGNATURE_IN_EMULATOR || '').toLowerCase() === 'true';

export const inboundSmsWebhook = async (request: Request, response: Response) => {
	try {
		if (request.method !== 'POST') {
			response.status(405).send('Method Not Allowed');
			return;
		}

		// Twilio posts application/x-www-form-urlencoded. With Express urlencoded enabled, this will be an object.
		const payload: TwilioInboundPayload = (request.body ?? {}) as TwilioInboundPayload;

		// Signature validation (recommended in production)
		const authToken = getTwilioAuthToken();
		const signature = (request.header('X-Twilio-Signature') || '').trim();

		const isEmulator = !!process.env.FUNCTIONS_EMULATOR;
		const shouldValidateSignature = !isEmulator || SHOULD_VALIDATE_SIGNATURE_IN_EMULATOR;

		if (shouldValidateSignature) {
			if (!authToken) {
				logger.warn('TWILIO_AUTH_TOKEN is missing. Skipping signature validation.');
			} else if (!signature) {
				logger.warn('X-Twilio-Signature header is missing. Skipping signature validation.');
			} else {
				const url = getPublicUrl(request);
				const isValid = validateTwilioSignature(authToken, signature, url, payload);
				if (!isValid) {
					logger.warn('Invalid Twilio signature', { url });
					response.status(403).send('Forbidden');
					return;
				}
			}
		} else if (isEmulator) {
			logger.log('Twilio signature validation skipped in emulator.');
		}

		const from = (payload.From || '').trim();
		const to = (payload.To || '').trim();
		const body = (payload.Body ?? '').toString().trim();
		const normalized = body.toLowerCase();

		if (!from) {
			response.status(400).send('Missing From');
			return;
		}

		if (isEmulator) {
			logger.log(`twilio inbound from=${from} to=${to} body=${body}`);
			logger.log(`payload=${safeStringify(payload, 2)}`);
		}

		// Always store inbound message (use MessageSid as doc id when available to avoid duplicates)
		const inboundRef = payload.MessageSid ? admin.firestore().collection('sms_inbound').doc(payload.MessageSid) : admin.firestore().collection('sms_inbound').doc();

		await inboundRef.set(
			{
				from,
				to,
				body,
				normalized,
				smsSid: payload.SmsSid || null,
				messageSid: payload.MessageSid || null,
				numMedia: payload.NumMedia || null,
				raw: payload,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);

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
		} else if (START_KEYWORDS.has(normalized)) {
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

export const trackClick = functions.https.onRequest(async (req, res) => {
	const userId = req.query.u || 'unknown';
	const campaign = req.query.c || 'vote-alice-2026';

	const realUrl = 'https://americasfavpet.com/2026/alice-1d7d';

	await admin
		.firestore()
		.collection('sms_clicks')
		.add({
			userId,
			campaign,
			ip: req.headers['x-forwarded-for'] || req.ip,
			userAgent: req.headers['user-agent'] || '',
			timestamp: admin.firestore.FieldValue.serverTimestamp(),
		});

	// Redirect with fallback message
	res.set('Cache-Control', 'no-store');
	res.set('Location', realUrl);
	res.status(302).send(`
    <html><body>
      <p>Redirecting to the voting page…</p>
      <p><a href="${realUrl}">Click here if not redirected</a></p>
    </body></html>
  `);
});

function getPublicUrl(req: Request): string {
	const proto = (req.header('x-forwarded-proto') || 'https').split(',')[0].trim();
	const host = (req.header('x-forwarded-host') || req.header('host') || '').split(',')[0].trim();
	const originalUrl = req.originalUrl.toString();

	// Cloud Functions strips the function name from originalUrl during routing.
	const functionName = 'twilio'; // your exported function name

	return `${proto}://${host}/${functionName}${originalUrl}`;
}

function validateTwilioSignature(authToken: string, twilioSignature: string, url: string, params: Record<string, any>): boolean {
	try {
		return twilio.validateRequest(authToken, twilioSignature, url, params);
	} catch {
		return false;
	}
}

/**
 * Loads Twilio Auth Token from:
 * 1) process.env.TWILIO_AUTH_TOKEN (local .env, Cloud Run env, etc.)
 * 2) Firebase Functions runtime config: twilio.auth_token (set via firebase functions:config:set ...)
 *
 * Note: functions.config() is deprecated but still works on v1. We access it via any-cast to avoid TS noise.
 */
function getTwilioAuthToken(): string | undefined {
	if (process.env.TWILIO_AUTH_TOKEN) return process.env.TWILIO_AUTH_TOKEN;

	try {
		const cfg = (functions as any).config?.() ?? {};
		return cfg?.twilio?.auth_token;
	} catch {
		return undefined;
	}
}
