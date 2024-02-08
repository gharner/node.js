import { Request, Response } from 'express';
import { admin } from '../middleware/firebase';
import OAuthClient from 'intuit-oauth';
import qbDev from '../middleware/quickbooks.dev.json';
import qbProd from '../middleware/quickbooks.prod.json';
import { qbToken } from '../interfaces';
//import { logger } from 'firebase-functions';

const config: any = process.env.GCLOUD_PROJECT === 'mas-development-53ac7' ? qbDev : qbProd;

const oauthClient = new OAuthClient({
	clientId: config.client_id,
	clientSecret: config.client_secret,
	environment: 'sandbox',
	redirectUri: config.redirect_uri,
});

export const auth_token = (request: Request, response: Response) => {
	const parseRedirect = request.url;

	// Exchange the auth code retrieved from the **req.url** on the redirectUri
	oauthClient
		.createToken(parseRedirect)
		.then(authResponse => {
			const payload = authResponse.getJson();
			return payload as unknown as qbToken;
		})
		.then(payload => {
			payload.server_time = new Date().valueOf();

			const t1 = new Date();
			t1.setSeconds(t1.getSeconds() + payload.expires_in);
			payload.expires_time = t1.valueOf();

			const t2 = new Date();
			t2.setSeconds(t2.getSeconds() + payload.x_refresh_token_expires_in);
			payload.refresh_time = t2.valueOf();

			admin.firestore()
				.doc('/mas-parameters/quickbooksAPI')
				.set(payload, { merge: true })
				.then(() => {
					const html_response =
						'<!DOCTYPE html><html lang="en"><head><title>Quickbooks Token Response</title><script>window.close();</script></head><body><h4>New Token Issued</h4></body></html>';
					response.send(html_response);
				});
		})
		.catch(e => {
			response.send(e);
		});
};

export const get_updates = (request: Request, response: Response) => {
	const axios = require('axios');

	admin.firestore()
		.doc('/mas-parameters/quickbooksAPI')
		.get()
		.then(doc => {
			const data = doc.data() as qbToken;
			let lastUpdated: string = '';

			if (data.expires_time) {
				lastUpdated = new Date(data.lastCustomerUpdate).toISOString().substring(0, 10);

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

				axios(config)
					.then((result: any) => {
						response.send(result.data.QueryResponse);
					})
					.catch((error: any) => {
						response.send(error);
					});
			} else {
				response.send('token error');
			}
		});
};

export const getCustomerByEmail = (request: Request, response: Response) => {
	const axios = require('axios');

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

	axios(config)
		.then((result: any) => {
			response.send(result.data.QueryResponse);
		})
		.catch((error: any) => {
			response.send(error);
		});
};

export const refresh_token = (request: Request, response: Response) => {
	oauthClient
		.refreshUsingToken(request.headers.refresh_token as string)
		.then(function (authResponse) {
			response.send(authResponse.getJson());
		})
		.catch(function (e) {
			console.error('The error message is :' + e.originalMessage);
			console.error(e.intuit_tid);
		});
};
