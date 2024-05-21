import axios, { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v1';
import OAuthClient from 'intuit-oauth';
import { qbToken } from '../interfaces';
import { admin } from '../middleware/firebase';
import qbDev from '../middleware/quickbooks.dev.json';
import qbProd from '../middleware/quickbooks.prod.json';
import { CustomError, handleError } from '../utilities/common';

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
	try {
		const auth_url = oauthClient.authorizeUri({
			scope: config.scope,
		});

		response.send(auth_url);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in auth_request:', additionalInfo);
		const customError = new CustomError('Failed to get auth URL', 'Auth Error', additionalInfo);
		handleError(customError, 'controller=>quickbooks=>auth_request', response);
	}
};

export const auth_token = async (request: Request, response: Response) => {
	const errorArray: any[] = [];

	try {
		errorArray.push({ step: 'initializing', auth_token: oauthClient });

		const parseRedirect = request.url;
		errorArray.push({ step: 'parsing redirect', parseRedirect });

		const authResponse: any = await oauthClient.createToken(parseRedirect);
		errorArray.push({ step: 'creating token', authResponse });

		/* 		const payload: any = await authResponse.getJson();
		errorArray.push({ step: 'getting payload', payload }); */

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
			errorArray,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in auth_token:', additionalInfo);
		const customError = new CustomError('Failed to get auth token', 'Auth Error', additionalInfo);
		handleError(customError, 'controller=>quickbooks=>auth_token', response);
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

		const customError = new CustomError('Failed to get_updates', 'Details', additionalInfo);
		handleError(customError, 'controller=>quickbooks=>get_updates', response);
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

		const customError = new CustomError('Failed to getCustomerByEmail', 'Details', additionalInfo);
		handleError(customError, 'controller=>quickbooks=>getCustomerByEmail', response);
	}
};

export const refresh_token = async (request: Request, response: Response) => {
	try {
		const authResponse = await oauthClient.refreshUsingToken(request.headers.refresh_token as string);
		response.send(authResponse.getJson());
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in refresh_token:', additionalInfo);

		const customError = new CustomError('Failed to refresh_token', 'Details', additionalInfo);
		handleError(customError, 'controller=>quickbooks=>refresh_token', response);
	}
};
