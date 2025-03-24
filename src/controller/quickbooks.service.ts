import { qbToken } from '../interfaces';
import { admin, oauthClient } from '../middleware/';
import { logWithTime } from '../utilities';
import Token from './Token';

export async function ensureValidToken(): Promise<qbToken> {
	logWithTime('🔐 ensureValidToken() called');

	const doc = await admin.firestore().doc('mas-parameters/quickbooksAPI').get();
	const data = doc.data();

	logWithTime('📦 Token data loaded from Firestore', data);

	if (!data) {
		throw { status: 401, message: 'Token missing from Firestore' };
	}

	const token = new Token(data);

	if (token.isAccessTokenValid()) {
		logWithTime('✅ Access token is valid, returning token');
		return data as qbToken;
	}

	const now = Date.now();
	const twentyFourHours = 24 * 60 * 60 * 1000;
	const refreshAge = now - (data.server_time ?? 0);

	if (!token.isRefreshTokenValid() || refreshAge > twentyFourHours || !data.refresh_expires_time) {
		logWithTime('🚫 refresh_expires_time is missing — reauth required');

		const authUrl = oauthClient.authorizeUri({
			scope: ['com.intuit.quickbooks.accounting'],
		});

		throw {
			status: 401,
			message: 'reauth_required',
			authUrl,
		};
	}

	logWithTime('🔄 Access token expired. Attempting refresh using refresh token...');

	try {
		const authResponse = await oauthClient.refreshUsingToken(token.refresh_token);
		const now = Date.now();

		const refreshed: qbToken = {
			...authResponse.body,
			server_time: now,
			createdAt: now,
			expires_time: now + (authResponse.body.expires_in ?? 3600) * 1000,
			refresh_time: now + (authResponse.body.x_refresh_token_expires_in ?? 86400) * 1000,
			refresh_expires_time: now + (authResponse.body.x_refresh_token_expires_in ?? 86400) * 1000,
		};

		// Remove undefined values
		const cleanToken = Object.entries(refreshed).reduce((acc, [key, val]) => {
			if (val !== undefined) acc[key] = val;
			return acc;
		}, {} as Record<string, any>);

		await admin.firestore().doc('mas-parameters/quickbooksAPI').set(cleanToken, { merge: true });

		logWithTime('✅ Token refreshed successfully');
		return cleanToken as qbToken;
	} catch (error) {
		logWithTime('❌ Error during token refresh attempt', error);

		const authUrl = oauthClient.authorizeUri({
			scope: ['com.intuit.quickbooks.accounting'],
		});

		throw {
			status: 401,
			message: 'reauth_required',
			authUrl,
			originalError: error,
		};
	}
}
