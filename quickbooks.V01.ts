import * as Sentry from '@sentry/google-cloud-serverless';
import axios, { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v1';
import OAuthClient from 'intuit-oauth';
import qbDev from '../middleware/quickbooks.dev.json';
import qbProd from '../middleware/quickbooks.prod.json';
import { qbToken } from './src/interfaces';
import { admin } from './src/middleware/firebase';

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

		authResponse.body.server_time = Date.now();
		const t1 = new Date();

		t1.setSeconds(t1.getSeconds() + authResponse.body.expires_in);
		authResponse.body.expires_time = t1.valueOf();

		const t2 = new Date();
		t2.setSeconds(t2.getSeconds() + authResponse.body.x_refresh_token_expires_in);
		authResponse.body.refresh_time = t2.valueOf();

		await admin.firestore().doc('/mas-parameters/quickbooksAPI').set(authResponse.body, { merge: true });

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

		// Log to Firebase logger
		logger.error('Error in auth_token:', additionalInfo);

		// Capture error in Sentry
		Sentry.captureException(e, {
			extra: additionalInfo,
		});

		// Send a generic error response
		response.status(500).send({ error: 'Failed to authenticate with QuickBooks' });
	}
};

export const refresh_token = async (request: Request, response: Response) => {
	try {
		const refreshToken = request.headers['refresh_token'] as string;
		if (!refreshToken) {
			throw new Error('Missing refresh_token header');
		}

		const authResponse = await oauthClient.refreshUsingToken(refreshToken); // No `.body`
		const tokenData = typeof authResponse === 'string' ? JSON.parse(authResponse) : authResponse;

		response.send(tokenData);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in refresh_token:', error);
		response.status(500).send({ error: 'Failed to refresh QuickBooks token' });
	}
};

/*******************************************************************************************
 *
 *  Functions that fetch and update Quickbook data
 *
 *******************************************************************************************/
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
