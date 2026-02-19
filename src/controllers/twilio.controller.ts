import { Request, Response } from 'express';
import twilio, { Twilio } from 'twilio';
import { admin } from '../modules/firebase.module';

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

	/**
	 * Lazily initializes the Twilio client.
	 * Required for Gen2 because secrets are injected at invocation time.
	 */
	private getClient(): Twilio {
		if (!this.client) {
			const accountSid = process.env.TWILIO_ACCOUNT_SID;
			const authToken = process.env.TWILIO_AUTH_TOKEN;

			if (!accountSid || !authToken) {
				throw new Error('Twilio secrets not available at runtime.');
			}

			this.client = twilio(accountSid, authToken);
		}

		return this.client;
	}

	// ======================================================
	// Firestore-triggered outbound SMS
	// ======================================================

	public async processFirestoreMessage(docRef: FirebaseFirestore.DocumentReference): Promise<void> {
		const snap = await docRef.get();
		const data = snap.data();

		if (!data) return;

		// Prevent duplicate sends
		if (data.status === 'sent' && data.sid) return;

		const { to, body, mediaUrls } = data;

		if (!to || !body) {
			await docRef.update({
				status: 'error',
				errorMessage: 'Missing required fields: to and/or body',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
			return;
		}

		const client = this.getClient();

		try {
			// Mark processing first
			await docRef.update({
				status: 'processing',
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			const message = await client.messages.create({
				to,
				body,
				messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
				...(Array.isArray(mediaUrls) && mediaUrls.length ? { mediaUrl: mediaUrls } : {}),
			});

			await docRef.update({
				status: 'sent',
				sid: message.sid,
				dateSent: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});
		} catch (error: any) {
			await docRef.update({
				status: 'error',
				errorMessage: error?.message || String(error),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			});

			throw error;
		}
	}

	// ======================================================
	// Twilio Delivery Status Webhook
	// ======================================================

	public async handleStatusWebhook(req: Request, res: Response): Promise<void> {
		const messageSid = req.body?.MessageSid;
		const messageStatus = req.body?.MessageStatus;

		if (!messageSid) {
			res.status(400).send('Missing MessageSid');
			return;
		}

		try {
			const snapshot = await admin.firestore().collection('sms_messages').where('sid', '==', messageSid).limit(1).get();

			if (!snapshot.empty) {
				await snapshot.docs[0].ref.update({
					deliveryStatus: messageStatus || 'unknown',
					statusUpdated: admin.firestore.FieldValue.serverTimestamp(),
				});
			}

			res.sendStatus(200);
		} catch (error) {
			res.status(500).send('Failed to update delivery status');
		}
	}

	// ======================================================
	// Optional: Inbound SMS Webhook
	// ======================================================

	public async handleInboundWebhook(req: Request, res: Response): Promise<void> {
		const { From, Body, MessageSid } = req.body;

		await admin
			.firestore()
			.collection('sms_inbound')
			.add({
				from: From || null,
				body: Body || null,
				sid: MessageSid || null,
				receivedAt: admin.firestore.FieldValue.serverTimestamp(),
				raw: req.body || {},
			});

		res.type('text/xml').send('<Response></Response>');
	}
}
