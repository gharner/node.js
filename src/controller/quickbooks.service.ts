import { qbToken } from '../interfaces';
import { admin, oauthClient } from '../middleware/';
import { logWithTime } from '../utilities';
import Token from './Token';

export async function ensureValidToken(): Promise<qbToken> {
	logWithTime('🔐 ensureValidToken() called');

	const docRef = admin.firestore().doc('mas-parameters/quickbooksAPI');
	const doc = await docRef.get();
	const data = doc.data();

	if (!data) {
		logWithTime('❌ No token found in Firestore');
		throw { status: 401, message: 'Token missing from Firestore' };
	}

	logWithTime('📦 Token data loaded from Firestore', {
		access_token: data.access_token?.slice(0, 10) + '...',
		refresh_token: data.refresh_token?.slice(0, 10) + '...',
		expires_time: data.expires_time,
		refresh_expires_time: data.refresh_expires_time,
		server_time: data.server_time,
	});

	const token = new Token(data);

	if (token.isAccessTokenValid()) {
		logWithTime('✅ Access token is valid. Returning existing token.');
		return data as qbToken;
	}

	if (token.isRefreshTokenValid()) {
		logWithTime('🔄 Access token expired. Attempting refresh using refresh token...');

		try {
			const authResponse = await oauthClient.refreshUsingToken(token.refresh_token);
			const now = Date.now();

			const updatedToken = {
				...authResponse.body,
				server_time: now,
				expires_time: now + (authResponse.body.expires_in ?? 3600) * 1000,
				refresh_time: now + (authResponse.body.x_refresh_token_expires_in ?? 86400) * 1000,
				refresh_expires_time: now + (authResponse.body.x_refresh_token_expires_in ?? 86400) * 1000,
			};

			const cleanToken = Object.entries(updatedToken).reduce((acc, [key, value]) => {
				if (value !== undefined) acc[key] = value;
				return acc;
			}, {} as Record<string, any>);

			logWithTime('💾 Writing refreshed token to Firestore', {
				expires_time: cleanToken.expires_time,
				refresh_expires_time: cleanToken.refresh_expires_time,
			});

			await docRef.set(cleanToken, { merge: true });

			logWithTime('✅ Token refresh successful. Returning new token.');
			return cleanToken as qbToken;
		} catch (error) {
			logWithTime('❌ Error during token refresh attempt', error);
			throw {
				status: 500,
				message: 'Failed to refresh token',
				originalError: error,
			};
		}
	}

	// If both tokens are expired, initiate reauth
	const authUrl = oauthClient.authorizeUri({
		scope: ['com.intuit.quickbooks.accounting'],
	});

	logWithTime('🔐 Both access and refresh tokens expired. Triggering reauth.');
	throw {
		status: 401,
		message: 'reauth_required',
		authUrl,
	};
}
