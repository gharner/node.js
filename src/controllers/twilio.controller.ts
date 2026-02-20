import { Request, Response } from 'express';
import { DocumentReference } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import twilio, { Twilio } from 'twilio';
import { admin, dbDefault } from '../modules';

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
	   Twilio Client (Lazy Init)
	====================================================== */

	private getClient(): Twilio {
		if (!this.client) {
			this.client = twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
		}
		return this.client;
	}

	/* ======================================================
	   Twilio Signature Validation
	====================================================== */

	private validateSignature(req: Request, publicUrl: string): boolean {
		const signature = req.headers['x-twilio-signature'] as string;

		if (!signature) {
			console.error('Missing X-Twilio-Signature header');
			return false;
		}

		const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN.value(), signature, publicUrl, req.body);

		if (!isValid) {
			console.error('Twilio signature validation FAILED');
			console.error('URL used:', publicUrl);
			console.error('Params:', req.body);
		}

		return isValid;
	}

	/* ======================================================
	   Firestore-triggered outbound SMS
	====================================================== */

	public async processFirestoreMessage(docRef: DocumentReference): Promise<void> {
		const defaultDocRef = dbDefault.doc(docRef.path);
		const snap = await defaultDocRef.get();
		const data = snap.data();

		if (!data) return;
		if (data.status === 'processing' || data.status === 'sent') return;

		const { to, body, mediaUrls } = data;

		if (!to || !body) {
			await defaultDocRef.update({
				status: 'error',
				errorMessage: 'Missing required fields: to and/or body',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
			return;
		}

		const client = this.getClient();

		try {
			await defaultDocRef.update({
				status: 'processing',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			const message = await client.messages.create({
				to,
				body,
				messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID.value(),
				...(Array.isArray(mediaUrls) && mediaUrls.length ? { mediaUrl: mediaUrls } : {}),
			});

			await defaultDocRef.update({
				status: 'sent',
				sid: message.sid,
				dateSent: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
		} catch (error: any) {
			await defaultDocRef.update({
				status: 'error',
				errorMessage: error?.message || String(error),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
			throw error;
		}
	}

	/* ======================================================
	   Twilio Inbound Webhook
	====================================================== */

	public async handleInboundWebhook(req: Request, res: Response): Promise<void> {
		const publicUrl = 'https://twilio-agwzindyha-uc.a.run.app/v1/inbound';

		if (!this.validateSignature(req, publicUrl)) {
			res.status(403).send('Invalid Twilio signature');
			return;
		}

		const { From, Body, MessageSid } = req.body;

		await dbDefault.collection('sms_inbound').add({
			from: From || null,
			body: Body || null,
			sid: MessageSid || null,
			receivedAt: admin.firestore.FieldValue.serverTimestamp(),
			raw: req.body || {},
		});

		res.type('text/xml').send('<Response></Response>');
	}

	/* ======================================================
	   Twilio Delivery Status Webhook
	====================================================== */

	public async handleStatusWebhook(req: Request, res: Response): Promise<void> {
		const publicUrl = 'https://twilio-agwzindyha-uc.a.run.app/v1/status';

		if (!this.validateSignature(req, publicUrl)) {
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
			const eventKey = `${messageSid}:${messageStatus}`;

			const existingEvent = await dbDefault.collection('twilio_webhook_events').doc(eventKey).get();

			if (existingEvent.exists) {
				res.sendStatus(200);
				return;
			}

			await dbDefault.collection('twilio_webhook_events').doc(eventKey).set({
				messageSid,
				messageStatus,
				processedAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			const snapshot = await dbDefault.collection('sms_messages').where('sid', '==', messageSid).limit(1).get();

			if (!snapshot.empty) {
				await snapshot.docs[0].ref.update({
					deliveryStatus: messageStatus,
					statusUpdated: admin.firestore.FieldValue.serverTimestamp(),
				});
			}

			res.sendStatus(200);
		} catch (error) {
			console.error('Twilio status webhook error:', error);
			res.status(500).send('Failed to update delivery status');
		}
	}
}
