import axios, { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v1';
import OAuthClient from 'intuit-oauth';
import { qbToken } from '../interfaces';
import { admin } from '../middleware/firebase';
import qbDev from '../middleware/quickbooks.dev.json';
import qbProd from '../middleware/quickbooks.prod.json';
import { CustomError, handleError, safeStringify } from '../utilities/common';

const config = process.env.GCLOUD_PROJECT === 'mas-development-53ac7' ? qbDev : qbProd;

const oauthClient = new OAuthClient({
	clientId: config.client_id,
	clientSecret: config.client_secret,
	environment: config.state === 'development' ? 'sandbox' : 'production',
	redirectUri: process.env.FUNCTIONS_EMULATOR ? `http://localhost:5001/${process.env.GCLOUD_PROJECT}/us-central1/qb/auth_token` : config.redirect_uri,
});

const isQbToken = (obj: any): obj is qbToken => {
	return (
		obj &&
		typeof obj.access_token === 'string' &&
		typeof obj.expires_in === 'number' &&
		typeof obj.refresh_token === 'string' &&
		typeof obj.x_refresh_token_expires_in === 'number'
	);
};

export const auth_request = (request: Request, response: Response) => {
	const errorArray: any[] = [];
	try {
		const auth_url = oauthClient.authorizeUri({
			scope: config.scope,
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

		logger.error('Error in auth_request:', additionalInfo);
		const customError = new CustomError('Failed to get auth URL', 'Auth Error', additionalInfo);
		handleError(customError, response);
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

		logger.error('Error in auth_token:', additionalInfo);
		const customError = new CustomError('Failed to get auth token', 'Auth Error', additionalInfo);
		handleError(customError, response);
	}
};

export const get_updates = async (request: Request, response: Response) => {
	try {
		const doc = await admin.firestore().doc('/mas-parameters/quickbooksAPI').get();
		const data = doc.data() as qbToken;

		if (!data || !data.expires_time) {
			response.status(400).send({ error: 'Invalid or expired token' });
		}

		const lastUpdated = new Date(data.lastCustomerUpdate).toISOString().substring(0, 10);
		const query = `Select * from Customer where Metadata.LastUpdatedTime > '${lastUpdated}'`;

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
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in get_updates:', additionalInfo);

		const customError = new CustomError('Failed to get_updates', 'controller=>quickbooks=>get_updates', additionalInfo);
		handleError(customError, response);
	}
};

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
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in getCustomerByEmail:', additionalInfo);

		const customError = new CustomError('Failed to getCustomerByEmail', 'controller=>quickbooks=>getCustomerByEmail', additionalInfo);
		handleError(customError, response);
	}
};

export const refresh_token = async (request: Request, response: Response) => {
	const errorArray: any[] = [];

	try {
		const refreshToken = <string>request.headers['refresh_token'];
		if (!refreshToken) {
			throw new CustomError('Missing refresh_token header', 'controller=>quickbooks=>refresh_token', { errorArray });
		}

		const authResponse = await oauthClient.refreshUsingToken(refreshToken);
		const safeResponse = safeStringify(authResponse);
		const safeResponseJSON = JSON.parse(safeResponse);
		logger.log(safeResponseJSON);
		errorArray.push(safeResponseJSON);

		response.send('success');
	} catch (e) {
		const additionalInfo = {
			errorArray,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		const customError = new CustomError('Failed to refresh token', 'controller=>quickbooks=>refresh_token', additionalInfo);
		handleError(customError, response);
	}
};
