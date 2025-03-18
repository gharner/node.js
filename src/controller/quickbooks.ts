import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import OAuthClient from './OAuthClient';

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
			state: 'firebase-secure-token',
		});

		response.redirect(authUri);
	} catch (error) {
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
		console.error('OAuth error:', error);
		response.status(500).send('OAuth authentication failed.');
	}
};

export const refreshQuickBooksToken = async (request: Request, response: Response) => {
	try {
		const refreshResponse = await oauthClient.refresh();
		const refreshedTokenJson = refreshResponse.getJson();

		response.json({ success: true, token: refreshedTokenJson });
	} catch (error) {
		console.error('Refresh Token Error:', error);
		response.status(500).send('Error refreshing QuickBooks token.');
	}
};
