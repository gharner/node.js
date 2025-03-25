import * as Sentry from '@sentry/node'; // Added Sentry import
import axios, { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v1';
import { quickbooksDev, quickbooksProd } from '../configs';
import { qbToken } from '../interfaces';
import { admin, logWithTime, oauthClient } from '../modules';
import Token from '../modules/Token.module';
import { ensureValidToken } from '../modules/quickbooks.module';

// Initialize Sentry
Sentry.init({
	dsn: process.env.SENTRY_DSN, // Your Sentry DSN should be set in environment variables
	environment: process.env.NODE_ENV || 'development',
});

const config = process.env.GCLOUD_PROJECT === 'mas-development-53ac7' ? quickbooksDev : quickbooksProd;

/*******************************************************************************************
 *
 *  Functions require for authentication
 *
 *******************************************************************************************/

const isQbToken = (obj: any): obj is qbToken => {
	return obj && typeof obj.access_token === 'string' && typeof obj.expires_in === 'number' && typeof obj.refresh_token === 'string' && typeof obj.x_refresh_token_expires_in === 'number';
};

export const auth_request = (request: Request, response: Response) => {
	const errorArray: any[] = [];
	try {
		const auth_url = oauthClient.authorizeUri({
			scope: [config.scope],
		});

		errorArray.push({ auth_url: auth_url });

		response.send(auth_url);
	} catch (e) {
		const additionalInfo = {
			errorDetails: errorArray, // Include any collected error details
			timestamp: new Date().toISOString(), // Add a timestamp
			originalError: e instanceof Error ? e : 'Unknown error', // Original error message
			functionContext: 'controller=>quickbooks=>auth_request', // Contextual information about where the error occurred
		};

		Sentry.captureException(e); // Report error to Sentry
		logger.error('Error in auth_request:', additionalInfo);
	}
};

export const auth_token = async (request: Request, response: Response) => {
	const errorArray: any[] = [];

	try {
		errorArray.push({ step: 'initializing', oauthClient });

		const parseRedirect = request.url;
		errorArray.push({ step: 'parsing redirect', parseRedirect });

		const authResponse: any = await oauthClient.createToken(parseRedirect);
		errorArray.push({ step: 'creating token', authResponse });

		if (!isQbToken(authResponse.body)) {
			throw new Error('Invalid token payload');
		}

		// ✅ Force use of current server time
		const now = Date.now();
		const accessLifespan = authResponse.body.expires_in ?? 3600; // fallback: 1h
		const refreshLifespan = authResponse.body.x_refresh_token_expires_in ?? 86400; // fallback: 24h

		authResponse.body.server_time = now;
		authResponse.body.expires_time = now + accessLifespan * 1000;
		authResponse.body.refresh_time = now + refreshLifespan * 1000;
		authResponse.body.refresh_expires_time = authResponse.body.refresh_time;

		const ref = admin.firestore().doc('mas-parameters/quickbooksAPI');

		const cleanToken = Object.entries(authResponse.body).reduce((acc, [key, value]) => {
			if (value !== undefined) acc[key] = value;
			return acc;
		}, {} as Record<string, any>);

		try {
			await ref.update(cleanToken);
		} catch (err: any) {
			if (err.code === 5 || err.message?.includes('No document')) {
				await ref.set(cleanToken, { merge: true });
			} else {
				throw err;
			}
		}

		const htmlResponse = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Quickbooks Token Response</title>
          <script>window.close();</script>
        </head>
        <body>
          <h4>New Token Issued</h4>
        </body>
      </html>
    `;

		response.send(htmlResponse);
	} catch (e) {
		const additionalInfo = {
			...errorArray,
			originalError: e instanceof Error ? e : 'Unknown error',
			timestamp: new Date().toISOString(),
		};

		Sentry.captureException(e);
		logger.error('Error in auth_token:', additionalInfo);
	}
};

export const refresh_token = async (request: Request, response: Response) => {
	try {
		const refreshToken = <string>request.headers['refresh_token'];
		if (!refreshToken) throw new Error('Missing refresh_token header');

		const authResponse = await oauthClient.refreshUsingToken(refreshToken);

		// ✅ Force use of current server time
		const now = Date.now();
		const accessLifespan = authResponse.body.expires_in ?? 3600;
		const refreshLifespan = authResponse.body.x_refresh_token_expires_in ?? 86400;

		authResponse.body.server_time = now;
		authResponse.body.expires_time = now + accessLifespan * 1000;
		authResponse.body.refresh_time = now + refreshLifespan * 1000;
		authResponse.body.refresh_expires_time = authResponse.body.refresh_time;
		authResponse.body.status = 'idle';

		const ref = admin.firestore().doc('mas-parameters/quickbooksAPI');

		const cleanToken = Object.entries(authResponse.body).reduce((acc, [key, value]) => {
			if (value !== undefined) acc[key] = value;
			return acc;
		}, {} as Record<string, any>);

		try {
			await ref.update(cleanToken);
		} catch (err: any) {
			if (err.code === 5 || err.message?.includes('No document')) {
				await ref.set(cleanToken, { merge: true });
			} else {
				throw err;
			}
		}

		response.send(cleanToken);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		Sentry.captureException(e);
		logWithTime('Failed to refresh token', additionalInfo);
	}
};

/*******************************************************************************************
 *
 *  Functions that fetch and update Quickbook data
 *
 *******************************************************************************************/
export const get_updates = async (request: Request, response: Response): Promise<void> => {
	const errorArray: any[] = [];

	try {
		const token: qbToken = await ensureValidToken();
		errorArray.push({ step: '✅ valid token fetched', token });

		const lastUpdated = new Date(token.lastCustomerUpdate ?? Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
		errorArray.push({ step: '📅 lastUpdated calculated', lastUpdated });

		const query = `Select * from Customer where Metadata.LastUpdatedTime > '${lastUpdated}'`;

		const config = {
			method: 'get',
			url: `https://${request.headers.endpoint}/v3/company/${request.headers.company}/query?query=${query}`,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token.access_token}`,
			},
		};

		errorArray.push({ step: '📦 query config built', config });

		const result: AxiosResponse = await axios(config);
		const customers = result.data.QueryResponse.Customer || [];

		logger.log('✅ Fetched customers:', customers);
		response.send(customers);
		return;
	} catch (e: any) {
		if (e.status === 401 && e.authUrl) {
			logWithTime('🔐 Reauth required in get_updates', e);
			response.status(401).send({
				error: 'reauth_required',
				authUrl: e.authUrl,
			});
			return;
		}

		const additionalInfo = {
			errorArray,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		Sentry.captureException(e);
		logWithTime('❌ controller=>quickbooks=>get_updates', additionalInfo);
		response.status(500).send({
			error: 'Failed to fetch customer updates',
			details: additionalInfo,
		});
		return;
	}
};

export const getCustomerByEmail = async (request: Request, response: Response): Promise<void> => {
	const errorArray: any[] = [];

	try {
		const token = await ensureValidToken();

		const email = request.headers.email as string;
		const company = request.headers.company as string;
		const endpoint = request.headers.endpoint as string;

		if (!email || !company || !endpoint) {
			response.status(400).send({ error: 'Missing required headers' });
			return;
		}

		const query = encodeURIComponent(`Select * from Customer where PrimaryEmailAddr = '${email}'`);
		const url = `https://${endpoint}/v3/company/${company}/query?query=${query}`;

		const config = {
			method: 'get',
			url,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token.access_token}`,
			},
		};

		errorArray.push({ step: '🔍 query setup', url, config });

		const result: AxiosResponse = await axios(config);
		errorArray.push({ step: '✅ query result', data: result.data.QueryResponse });

		response.send(result.data.QueryResponse);
		return;
	} catch (e: any) {
		if (e.status === 401 && e.authUrl) {
			logWithTime('🔐 Reauth required in getCustomerByEmail', e);
			response.status(401).send({
				error: 'reauth_required',
				authUrl: e.authUrl,
			});
			return;
		}

		const additionalInfo = {
			errorArray,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		Sentry.captureException(e);
		logWithTime('❌ controller=>quickbooks=>getCustomerByEmail', additionalInfo);
		response.status(400).send({
			error: 'Failed to get customer by email',
			details: additionalInfo,
		});
		return;
	}
};

export const validateToken = async (request: Request, response: Response) => {
	const errorArray: any[] = [];

	try {
		const tokenData: Token = new Token(request.body);
		logWithTime('tokenData', tokenData);
		errorArray.push({ step: 'received token', tokenData });

		if (!tokenData || !tokenData.access_token) {
			throw new Error('No valid token provided');
		}

		const isAccessTokenValid = tokenData.isAccessTokenValid();
		const isRefreshTokenValid = tokenData.isRefreshTokenValid();
		errorArray.push({ step: 'token validation', isAccessTokenValid, isRefreshTokenValid });
		const tokenState: { validAccessToken: boolean; validRefreshToken: boolean } = { validAccessToken: isAccessTokenValid, validRefreshToken: isRefreshTokenValid };

		if (isAccessTokenValid) {
			response.send({ message: 'Access token is valid', tokenState: tokenState });
		} else if (isRefreshTokenValid) {
			response.send({ message: 'Access token expired, but refresh token is valid', tokenState: tokenState });
		} else {
			response.send({ message: 'Both access and refresh tokens are expired', tokenState: tokenState });
		}
	} catch (e) {
		const additionalInfo = {
			errorArray,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		Sentry.captureException(e);
		console.error('Error in validateToken:', additionalInfo);
		response.status(400).send({ error: 'Failed to validate token', details: additionalInfo });
	}
};
