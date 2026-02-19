import { DocumentReference, FieldValue } from '@google-cloud/firestore';
import { Request, Response } from 'express';
import { defineSecret } from 'firebase-functions/params';
import twilio, { Twilio } from 'twilio';
import { enterpriseDb } from '../modules';

/* ======================================================
   Secrets (Gen2 Safe)
====================================================== */

const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_MESSAGING_SERVICE_SID = defineSecret('TWILIO_MESSAGING_SERVICE_SID');

/* ======================================================
   Twilio Controller
====================================================== */

export class TwilioController {
	private static instance: TwilioController;
	private client?: Twilio;

	private constructor() {}

	public static getInstance(): TwilioController {
		if (!TwilioController.instance) {
			TwilioController.instance = new TwilioController();
		}
		return TwilioController.instance;
	}

	/* ======================================================
	   Twilio Client (Lazy Init, Gen2 Safe)
	====================================================== */

	private getClient(): Twilio {
		if (!this.client) {
			this.client = twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
		}
		return this.client;
	}

	/* ======================================================
	   Firestore-triggered outbound SMS
	   (Enterprise DB only)
	====================================================== */

	public async processFirestoreMessage(docRef: DocumentReference): Promise<void> {
		const snap = await docRef.get();
		const data = snap.data();

		if (!data) return;

		if (data.status === 'processing') return;

		const { to, body, mediaUrls } = data;

		if (!to || !body) {
			await docRef.update({
				status: 'error',
				errorMessage: 'Missing required fields: to and/or body',
				updatedAt: FieldValue.serverTimestamp(),
			});
			return;
		}

		const client = this.getClient();

		try {
			await docRef.update({
				status: 'processing',
				updatedAt: FieldValue.serverTimestamp(),
			});

			const message = await client.messages.create({
				to,
				body,
				messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID.value(),
				...(Array.isArray(mediaUrls) && mediaUrls.length ? { mediaUrl: mediaUrls } : {}),
			});

			await docRef.update({
				status: 'sent',
				sid: message.sid,
				dateSent: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp(),
			});
		} catch (error: any) {
			await docRef.update({
				status: 'error',
				errorMessage: error?.message || String(error),
				updatedAt: FieldValue.serverTimestamp(),
			});
			throw error;
		}
	}

	/* ======================================================
	   Twilio Signature Validation (CRITICAL)
	====================================================== */

	private validateSignature(req: Request): boolean {
		const signature = req.headers['x-twilio-signature'] as string;
		if (!signature) return false;

		const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

		// Twilio needs the raw body string. If Express.raw was used, req.body is a Buffer.
		const raw = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;

		return twilio.validateRequest(TWILIO_AUTH_TOKEN.value(), signature, fullUrl, raw);
	}

	/* ======================================================
	   Twilio Delivery Status Webhook
	   (Enterprise DB + Signature Validation)
	====================================================== */

	public async handleStatusWebhook(req: Request, res: Response): Promise<void> {
		// ✅ Validate Twilio signature
		if (!this.validateSignature(req)) {
			res.status(403).send('Invalid Twilio signature');
			return;
		}

		const messageSid = req.body?.MessageSid;
		const messageStatus = req.body?.MessageStatus || 'unknown';

		if (!messageSid) {
			res.status(400).send('Missing MessageSid');
			return;
		}

		try {
			/* ======================================================
		   Replay Protection (Twilio may retry webhooks)
		   Prevent processing same status more than once
		====================================================== */

			const eventKey = `${messageSid}:${messageStatus}`;

			const existingEvent = await enterpriseDb.collection('twilio_webhook_events').doc(eventKey).get();

			if (existingEvent.exists) {
				// Already processed — acknowledge but do nothing
				res.sendStatus(200);
				return;
			}

			// Record event as processed
			await enterpriseDb.collection('twilio_webhook_events').doc(eventKey).set({
				messageSid,
				messageStatus,
				processedAt: FieldValue.serverTimestamp(),
			});

			/* ======================================================
		   Update Related SMS Document
		====================================================== */

			const snapshot = await enterpriseDb.collection('sms_messages').where('sid', '==', messageSid).limit(1).get();

			if (!snapshot.empty) {
				await snapshot.docs[0].ref.update({
					deliveryStatus: messageStatus,
					statusUpdated: FieldValue.serverTimestamp(),
				});
			}

			res.sendStatus(200);
		} catch (error) {
			// Log safely without leaking data
			console.error('Twilio status webhook error:', error);
			res.status(500).send('Failed to update delivery status');
		}
	}

	/* ======================================================
	   Twilio Inbound Webhook
	   (Enterprise DB + Signature Validation)
	====================================================== */

	public async handleInboundWebhook(req: Request, res: Response): Promise<void> {
		if (!this.validateSignature(req)) {
			res.status(403).send('Invalid Twilio signature');
			return;
		}

		const { From, Body, MessageSid } = req.body;

		await enterpriseDb.collection('sms_inbound').add({
			from: From || null,
			body: Body || null,
			sid: MessageSid || null,
			receivedAt: FieldValue.serverTimestamp(),
			raw: req.body || {},
		});

		res.type('text/xml').send('<Response></Response>');
	}
}
