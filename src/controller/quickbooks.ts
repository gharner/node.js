import * as Sentry from '@sentry/google-cloud-serverless';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v1';
import { readFileSync } from 'fs';
import path from 'path';
import qbDev from '../middleware/quickbooks.dev.json';
import qbProd from '../middleware/quickbooks.prod.json';
import OAuthClient from './OAuthClient';

console.log(qbProd.redirect_uri);
console.log(qbDev.redirect_uri);

Sentry.init({
	dsn: 'https://3bc129af82c1d7ef8f769984a04535df@o4508904065204224.ingest.us.sentry.io/4508989823451136',
	tracesSampleRate: 1.0,
});

// 🔹 Determine which config file to load
const isDev = process.env.GCLOUD_PROJECT === 'mas-development-53ac7';
const configPath = path.join(__dirname, `../middleware/quickbooks.${isDev ? 'dev' : 'prod'}.json`);

// 🔹 Load configuration dynamically
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

const oauthClient = new OAuthClient({
	clientId: config.client_id,
	clientSecret: config.client_secret,
	environment: config.state === 'development' ? 'sandbox' : 'production',
	redirectUri: process.env.FUNCTIONS_EMULATOR ? `http://localhost:5001/${process.env.GCLOUD_PROJECT}/us-central1/qb/quickBooksCallback` : config.redirect_uri,
	logging: true,
});

export const getQuickBooksAuthUrl = async (request: Request, response: Response) => {
	try {
		const authUri = oauthClient.authorizeUri({
			scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
			state: config.state,
		});
		response.redirect(authUri);
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error generating QuickBooks auth URL:', error);
		response.status(500).send('Error generating QuickBooks auth URL');
	}
};

export const quickBooksCallback = async (request: Request, response: Response) => {
	try {
		const authResponse = await oauthClient.createToken(request.url);
		const tokenJson = authResponse.getJson();
		response.json({ success: true, token: tokenJson });
	} catch (error) {
		Sentry.captureException(error);
		console.error('OAuth error:', error);
		response.status(500).send('OAuth authentication failed.');
	}
};

export const refreshQuickBooksToken = async (request: Request, response: Response) => {
	try {
		const refreshToken = request.headers['refresh_token'];

		if (!refreshToken) {
			const error = new Error('The Refresh token is missing');
			Sentry.captureException(error);
			throw error;
		}

		const refreshResponse = await oauthClient.refresh();
		const refreshedTokenJson = refreshResponse.getJson();

		response.json({ success: true, token: refreshedTokenJson });
	} catch (error) {
		Sentry.captureException(error);
		console.error('Refresh Token Error:', error);
		response.status(500).send('Error refreshing QuickBooks token.');
	}
};

export const refreshUsingToken = async (request: Request, response: Response) => {
	try {
		const refreshToken = request.headers['refresh_token'] as string;
		if (!refreshToken) {
			throw new Error('Missing refresh_token header');
		}

		const authResponse = await oauthClient.refreshUsingToken(refreshToken);
		const tokenData = authResponse.getJson();

		response.send(tokenData);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in refresh_token:', error);
		response.status(500).send({ error: 'Failed to refresh QuickBooks token' });
	}
};
