import crypto from 'crypto';
import { Request, Response } from 'express';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { google } from 'googleapis';

import { FieldValue } from '@google-cloud/firestore';
import { enterpriseDb } from '../modules';

/* -----------------------------
   Params + Secrets
----------------------------- */

const GOOGLE_CLIENT_ID = defineString('MAS_GOOGLE_CLIENT_ID');
const GOOGLE_REDIRECT_URI = defineString('MAS_GOOGLE_REDIRECT_URI');
const GOOGLE_SCOPES = defineString('MAS_GOOGLE_SCOPES');

const MAS_GOOGLE_CLIENT = defineSecret('MAS_GOOGLE_CLIENT');

/* -----------------------------
   Helpers
----------------------------- */

const debugLog = (message: string, data?: any): void => {
	if (process.env.FUNCTIONS_EMULATOR) {
		logger.log(`${message}=${data ? JSON.stringify(data, null, 2) : ''}`);
	}
};

const getRedirectUri = (): string => {
	return process.env.FUNCTIONS_EMULATOR ? `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT}/us-central1/gapi/oAuthCallback` : GOOGLE_REDIRECT_URI.value();
};

const createOAuth2Client = () => {
	return new google.auth.OAuth2(GOOGLE_CLIENT_ID.value(), MAS_GOOGLE_CLIENT.value(), getRedirectUri());
};

const getScopes = (): string[] => {
	// You are currently storing scopes as a space-delimited string
	// Example: "scope1 scope2 scope3"
	return GOOGLE_SCOPES.value()
		.split(' ')
		.map(s => s.trim())
		.filter(Boolean);
};

/* -----------------------------
   OAuth State Storage (Enterprise)
   - Prevents CSRF / callback injection
----------------------------- */

const OAUTH_STATE_COLLECTION = 'oauthStates';
const STATE_TTL_MINUTES = 10;

async function createAndStoreState(): Promise<string> {
	const state = crypto.randomUUID();

	const now = Date.now();
	const expiresAtMs = now + STATE_TTL_MINUTES * 60 * 1000;

	await enterpriseDb.collection(OAUTH_STATE_COLLECTION).doc(state).set(
		{
			state,
			used: false,
			createdAt: FieldValue.serverTimestamp(),
			expiresAtMs,
		},
		{ merge: false },
	);

	return state;
}

async function validateAndConsumeState(state: string): Promise<void> {
	const ref = enterpriseDb.collection(OAUTH_STATE_COLLECTION).doc(state);
	const snap = await ref.get();

	if (!snap.exists) {
		throw new Error('Invalid OAuth state (not found).');
	}

	const data = snap.data() as any;

	if (data.used === true) {
		throw new Error('Invalid OAuth state (already used).');
	}

	const expiresAtMs = Number(data.expiresAtMs || 0);
	if (!expiresAtMs || Date.now() > expiresAtMs) {
		throw new Error('Invalid OAuth state (expired).');
	}

	// Mark as used to prevent replay
	await ref.set(
		{
			used: true,
			usedAt: FieldValue.serverTimestamp(),
		},
		{ merge: true },
	);
}

/* -----------------------------
   OAuth Login URL
----------------------------- */

export const googleLogin = onRequest({ secrets: [MAS_GOOGLE_CLIENT] }, async (request: Request, response: Response) => {
	try {
		const oAuth2Client = createOAuth2Client();
		const scopes = getScopes();

		// Generate and store CSRF state
		const state = await createAndStoreState();

		const authUrl = oAuth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: scopes,
			prompt: 'consent',
			state,
		});

		debugLog('authUrl', authUrl);

		response.set('Cache-Control', 'private, max-age=0, s-maxage=0');
		response.status(200).send({ authUrl });
	} catch (e) {
		logger.error('Error in googleLogin:', e);
		response.status(500).send({ error: 'Failed to generate login URL' });
	}
});

/* -----------------------------
   OAuth Callback
   - Validates state (CSRF)
   - Exchanges code for tokens
   - Stores tokens in Enterprise DB
----------------------------- */

export const oAuthCallback = onRequest({ secrets: [MAS_GOOGLE_CLIENT] }, async (request: Request, response: Response) => {
	const { error, code, state } = request.query as {
		error?: string;
		code?: string;
		state?: string;
	};

	if (error) {
		response.status(400).send({ error: `OAuth error: ${error}` });
		return;
	}

	if (!code) {
		response.status(400).send({ error: 'Missing authorization code' });
		return;
	}

	if (!state) {
		response.status(400).send({ error: 'Missing OAuth state' });
		return;
	}

	try {
		// Validate state, one-time use
		await validateAndConsumeState(state);

		const oAuth2Client = createOAuth2Client();
		const { tokens } = await oAuth2Client.getToken(code);

		// Optional: get user info (helps you associate token to a user)
		oAuth2Client.setCredentials(tokens);

		const oauth2 = google.oauth2({
			auth: oAuth2Client,
			version: 'v2',
		});

		const { data } = await oauth2.userinfo.get();
		const email = data?.email || null;

		// Store token payload in Enterprise DB
		await enterpriseDb.collection('oauthTokens').add({
			email,
			user: data || null,
			tokens,
			createdAt: FieldValue.serverTimestamp(),
			state,
		});

		// If you are using a popup flow, return HTML that closes the window
		const htmlResponse = `<!DOCTYPE html>
<html lang="en">
<head>
	<title>Google OAuth Complete</title>
	<script>window.close();</script>
</head>
<body>
	<h4>OAuth complete. You can close this window.</h4>
</body>
</html>`;

		response.status(200).send(htmlResponse);
	} catch (e) {
		logger.error('OAuth callback failed:', e);
		response.status(500).send({ error: 'OAuth callback failed' });
	}
});
