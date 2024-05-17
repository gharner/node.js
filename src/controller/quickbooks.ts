import axios, { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v1';
import OAuthClient from 'intuit-oauth';
import { qbToken } from '../interfaces';
import { admin } from '../middleware/firebase';
import qbDev from '../middleware/quickbooks.dev.json';
import qbProd from '../middleware/quickbooks.prod.json';

const config = process.env.GCLOUD_PROJECT === 'mas-development-53ac7' ? qbDev : qbProd;

const oauthClient = new OAuthClient({
	clientId: config.client_id,
	clientSecret: config.client_secret,
	environment: config.state === 'development' ? 'sandbox' : 'production',
	redirectUri: config.redirect_uri,
});

const handleError = (response: Response, error: unknown) => {
	if (error instanceof Error) {
		logger.error('Error:', error.message);
		response.status(500).send({ error: error.message });
	} else {
		logger.error('Unknown error:', error);
		response.status(500).send({ error: 'Internal Server Error' });
	}
};

const isQbToken = (obj: any): obj is qbToken => {
	return (
		obj &&
		typeof obj.access_token === 'string' &&
		typeof obj.expires_in === 'number' &&
		typeof obj.refresh_token === 'string' &&
		typeof obj.x_refresh_token_expires_in === 'number' &&
		typeof obj.lastCustomerUpdate === 'string'
	);
};

export const auth_request = (response: Response) => {
	try {
		const auth_url = oauthClient.authorizeUri({
			scope: config.scope,
		});

		logger.info('auth_url:', auth_url);

		response.send(auth_url);
	} catch (e) {
		handleError(response, e);
	}
};
export const auth_token = async (request: Request, response: Response) => {
	try {
		logger.info('auth_token:', oauthClient);

		const parseRedirect = request.url;
		logger.info('parseRedirect:', parseRedirect);

		const authResponse = await oauthClient.createToken(parseRedirect);
		logger.info('authResponse:', authResponse);

		const payload = authResponse.getJson();
		logger.info('payload:', payload);

		if (!isQbToken(payload)) {
			throw new Error('Invalid token payload');
		}

		payload.server_time = new Date().valueOf();
		const t1 = new Date();
		t1.setSeconds(t1.getSeconds() + payload.expires_in);
		payload.expires_time = t1.valueOf();
		const t2 = new Date();
		t2.setSeconds(t2.getSeconds() + payload.x_refresh_token_expires_in);
		payload.refresh_time = t2.valueOf();

		await admin.firestore().doc('/mas-parameters/quickbooksAPI').set(payload, { merge: true });

		const html_response =
			'<!DOCTYPE html><html lang="en"><head><title>Quickbooks Token Response</title><script>window.close();</script></head><body><h4>New Token Issued</h4></body></html>';
		response.send(html_response);
	} catch (e) {
		handleError(response, e);
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
		handleError(response, e);
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
		handleError(response, e);
	}
};

export const refresh_token = async (request: Request, response: Response) => {
	try {
		const authResponse = await oauthClient.refreshUsingToken(request.headers.refresh_token as string);
		response.send(authResponse.getJson());
	} catch (e) {
		if (e instanceof Error) {
			console.error('The error message is:', e.message);
		} else {
			console.error('Unknown error:', e);
		}
		handleError(response, e);
	}
};
