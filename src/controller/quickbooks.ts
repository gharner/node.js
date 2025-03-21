import * as Sentry from '@sentry/node'; // Added Sentry import
import axios, { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v1';
import { qbToken } from '../interfaces';
import { admin } from '../middleware/firebase';
import qbDev from '../middleware/quickbooks.dev.json';
import qbProd from '../middleware/quickbooks.prod.json';
import { safeStringify } from '../utilities/common';
import OAuthClient from './OAuthClient';
import Token from './Token';

// Initialize Sentry
Sentry.init({
	dsn: process.env.SENTRY_DSN, // Your Sentry DSN should be set in environment variables
	environment: process.env.NODE_ENV || 'development',
});

const config = process.env.GCLOUD_PROJECT === 'mas-development-53ac7' ? qbDev : qbProd;

/*******************************************************************************************
 *
 *  Functions require for authentication
 *
 *******************************************************************************************/
const oauthClient = new OAuthClient({
	clientId: config.client_id,
	clientSecret: config.client_secret,
	environment: config.state === 'development' ? 'sandbox' : 'production',
	redirectUri: process.env.FUNCTIONS_EMULATOR ? `http://localhost:5001/${process.env.GCLOUD_PROJECT}/us-central1/qb/auth_token` : config.redirect_uri,
});

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
			originalError: e instanceof Error ? e.message : 'Unknown error', // Original error message
			stack: e instanceof Error ? e.stack : 'No stack trace available', // Include the stack trace if available
			functionContext: 'controller=>quickbooks=>auth_request', // Contextual information about where the error occurred
		};

		Sentry.captureException(e); // Report error to Sentry
		logger.error('Error in auth_request:', additionalInfo);
	}
};

export const auth_token = async (request: Request, response: Response) => {
	const errorArray: any[] = [];

	try {
		errorArray.push({ step: 'initializing', oauthClient: oauthClient });

		const parseRedirect = request.url;
		errorArray.push({ step: 'parsing redirect', parseRedirect });

		const authResponse: any = await oauthClient.createToken(parseRedirect);
		errorArray.push({ step: 'creating token', authResponse });

		if (!isQbToken(authResponse.body)) {
			throw new Error('Invalid token payload');
		}

		// Use a single starting point for all calculations.
		const serverTime = Date.now();
		authResponse.body.server_time = serverTime;

		// Calculate access token expiry using expires_in (in seconds).
		const expiresDuration = authResponse.body.expires_in; // seconds
		authResponse.body.expires_time = serverTime + expiresDuration * 1000;
		console.log(authResponse.body.expires_time);

		// Calculate refresh token expiry using x_refresh_token_expires_in (in seconds).
		/* 		const refreshDuration = authResponse.body.x_refresh_token_expires_in; // seconds
		authResponse.body.refresh_time = serverTime + refreshDuration * 1000; */
		authResponse.body.refresh_time = serverTime + expiresDuration * 1000;
		console.log(authResponse.body.refresh_time);

		// If you need a separate refresh_expires_time, you can assign it the refresh_time
		authResponse.body.refresh_expires_time = authResponse.body.refresh_time;

		await admin.firestore().doc('mas-parameters/quickbooksAPI').set(authResponse.body, { merge: true });

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
			originalError: e instanceof Error ? e.message : 'Unknown error',
			timestamp: new Date().toISOString(),
		};

		Sentry.captureException(e); // Report error to Sentry
		logger.error('Error in auth_token:', additionalInfo);
	}
};

export const refresh_token = async (request: Request, response: Response) => {
	try {
		const refreshToken = <string>request.headers['refresh_token'];
		if (!refreshToken) {
			console.log('Missing refresh_token header');
			throw new Error('Missing refresh_token header');
		}

		const authResponse = await oauthClient.refreshUsingToken(refreshToken);
		const safeResponse = safeStringify(authResponse);
		const safeResponseJSON = JSON.parse(safeResponse);

		// ⏱️ Add timing fields just like in auth_token
		const serverTime = Date.now();
		authResponse.body.server_time = serverTime;

		const expiresDuration = authResponse.body.expires_in; // seconds
		authResponse.body.expires_time = serverTime + expiresDuration * 1000;

		const refreshDuration = authResponse.body.x_refresh_token_expires_in; // seconds
		authResponse.body.refresh_time = serverTime + refreshDuration * 1000;

		authResponse.body.refresh_expires_time = authResponse.body.refresh_time;

		// 🔥 Write to Firestore with the updated token
		await admin.firestore().doc('/mas-parameters/quickbooksAPI').set(authResponse.body, { merge: true });

		// Return to client
		response.send(safeResponseJSON);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		Sentry.captureException(e);
		console.log('Failed to refresh token', 'controller=>quickbooks=>refresh_token', additionalInfo);
	}
};

/*******************************************************************************************
 *
 *  Functions that fetch and update Quickbook data
 *
 *******************************************************************************************/
export const get_updates = async (request: Request, response: Response) => {
	const errorArray: any[] = [];
	try {
		const doc = await admin.firestore().doc('/mas-parameters/quickbooksAPI').get();
		const data = doc.data() as qbToken;
		errorArray.push(data);

		if (!data || !data.expires_time) {
			response.status(400).send({ error: 'Invalid or expired token' });
		}

		const lastUpdated = new Date(data.lastCustomerUpdate).toISOString().substring(0, 10);
		errorArray.push(lastUpdated);

		const query = `Select * from Customer where Metadata.LastUpdatedTime > '${lastUpdated}'`;

		const config = {
			method: 'get',
			url: `https://${request.headers.endpoint}/v3/company/${request.headers.company}/query?query=${query}`,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${request.headers.token}`,
			},
		};
		errorArray.push(config);

		const result: AxiosResponse = await axios(config);
		errorArray.push(result.data.QueryResponse.Customer);
		logger.log(result.data.QueryResponse.Customer);

		response.send(result.data.QueryResponse.Customer);
	} catch (e) {
		const additionalInfo = {
			errorArray,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		Sentry.captureException(e); // Report error to Sentry
		console.log('Failed to get_updates', 'controller=>quickbooks=>get_updates', additionalInfo);
	}
};

export const getCustomerByEmail = async (request: Request, response: Response) => {
	const errorArray: any[] = [];
	try {
		const query = `Select * from Customer where PrimaryEmailAddr = '${request.headers.email}'`;
		errorArray.push(query);

		const config = {
			method: 'get',
			url: `https://${request.headers.endpoint}/v3/company/${request.headers.company}/query?query=${query}`,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/text',
				Authorization: `Bearer ${request.headers.token}`,
			},
		};
		errorArray.push(config);

		const result: AxiosResponse = await axios(config);
		errorArray.push(result.data.QueryResponse);

		response.send(result.data.QueryResponse);
	} catch (e) {
		const additionalInfo = {
			errorArray,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		Sentry.captureException(e); // Report error to Sentry
		console.log('Failed to getCustomerByEmail', 'controller=>quickbooks=>getCustomerByEmail', additionalInfo);
	}
};

export const validateToken = async (request: Request, response: Response) => {
	const errorArray: any[] = [];

	try {
		const tokenData: Token = new Token(request.body);
		console.log('tokenData', tokenData);
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
