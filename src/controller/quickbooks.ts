import * as Sentry from '@sentry/google-cloud-serverless';
import axios, { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v1';
import OAuthClient from 'intuit-oauth';
import { qbToken } from '../interfaces';
import { admin } from '../middleware/firebase';
import qbDev from '../middleware/quickbooks.dev.json';
import qbProd from '../middleware/quickbooks.prod.json';

// Initialize Sentry
Sentry.init({
	dsn: 'https://3bc129af82c1d7ef8f769984a04535df@o4508904065204224.ingest.us.sentry.io/4508989823451136',
	tracesSampleRate: 1.0,
});

const config = process.env.GCLOUD_PROJECT === 'mas-development-53ac7' ? qbDev : qbProd;

/**
 * OAuth Client Initialization for QuickBooks Authentication
 */
const oauthClient = new OAuthClient({
	clientId: config.client_id,
	clientSecret: config.client_secret,
	environment: config.state === 'development' ? 'sandbox' : 'production',
	redirectUri: process.env.FUNCTIONS_EMULATOR ? `http://localhost:5001/${process.env.GCLOUD_PROJECT}/us-central1/qb/auth_token` : config.redirect_uri,
});

const isQbToken = (obj: any): obj is qbToken => {
	return obj && typeof obj.access_token === 'string' && typeof obj.expires_in === 'number';
};

/**
 * Request QuickBooks Authorization URL
 */
export const auth_request = (request: Request, response: Response) => {
	try {
		const auth_url = oauthClient.authorizeUri({
			scope: config.scope,
		});
		response.send(auth_url);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in auth_request:', error);
		response.status(500).send({ error: 'Failed to get QuickBooks auth URL' });
	}
};

/**
 * Handle QuickBooks OAuth Token Exchange
 */
export const auth_token = async (request: Request, response: Response) => {
	try {
		const authResponse = await oauthClient.createToken(request.url); // No `.body` needed
		const tokenData = authResponse.getJson(); // Use `.getJson()` to get token data

		if (!isQbToken(tokenData)) {
			throw new Error('Invalid token payload');
		}

		tokenData.server_time = Date.now();
		tokenData.expires_time = Date.now() + tokenData.expires_in * 1000;
		tokenData.refresh_time = Date.now() + tokenData.x_refresh_token_expires_in * 1000;

		await admin.firestore().doc('/mas-parameters/quickbooksAPI').set(tokenData, { merge: true });

		response.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Quickbooks Token Response</title><script>window.close();</script></head>
        <body><h4>New Token Issued</h4></body>
      </html>
    `);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in auth_token:', error);
		response.status(500).send({ error: 'Failed to get QuickBooks auth token' });
	}
};

/**
 * Refresh QuickBooks OAuth Token
 */ export const refresh_token = async (request: Request, response: Response) => {
	try {
		const refreshToken = request.headers['refresh_token'] as string;
		if (!refreshToken) {
			throw new Error('Missing refresh_token header');
		}

		const authResponse = await oauthClient.refreshUsingToken(refreshToken); // No `.body`
		const tokenData = authResponse.getJson(); // Extract token data

		response.send(tokenData);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in refresh_token:', error);
		response.status(500).send({ error: 'Failed to refresh QuickBooks token' });
	}
};

/**
 * Get QuickBooks Updates Based on Last Sync
 */
export const get_updates = async (request: Request, response: Response) => {
	try {
		const doc = await admin.firestore().doc('/mas-parameters/quickbooksAPI').get();
		const data = doc.data() as qbToken;

		if (!data || !data.expires_time) {
			response.status(400).send({ error: 'Invalid or expired token' });
			return;
		}

		const lastUpdated = new Date(data.lastCustomerUpdate).toISOString().substring(0, 10);
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

		const result: AxiosResponse = await axios(config);
		response.send(result.data.QueryResponse.Customer);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in get_updates:', error);
		response.status(500).send({ error: 'Failed to get QuickBooks updates' });
	}
};

/**
 * Get QuickBooks Customer by Email
 */
export const getCustomerByEmail = async (request: Request, response: Response) => {
	try {
		const query = `Select * from Customer where PrimaryEmailAddr = '${request.headers.email}'`;

		const config = {
			method: 'get',
			url: `https://${request.headers.endpoint}/v3/company/${request.headers.company}/query?query=${query}`,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/text',
				Authorization: `Bearer ${request.headers.token}`,
			},
		};

		const result: AxiosResponse = await axios(config);
		response.send(result.data.QueryResponse);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in getCustomerByEmail:', error);
		response.status(500).send({ error: 'Failed to retrieve QuickBooks customer by email' });
	}
};
