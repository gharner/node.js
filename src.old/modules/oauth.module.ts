// src/services/oauthClientInstance.ts
import { quickbooksDev, quickbooksProd } from '../configs';
import OAuthClient from './OAuthClient.module';

const config = process.env.GCLOUD_PROJECT === 'mas-development-53ac7' ? quickbooksDev : quickbooksProd;

const oauthClient = new OAuthClient({
	clientId: config.client_id,
	clientSecret: config.client_secret,
	environment: config.state === 'development' ? 'sandbox' : 'production',
	redirectUri: process.env.FUNCTIONS_EMULATOR ? `http://localhost:5001/${process.env.GCLOUD_PROJECT}/us-central1/qb/auth_token` : config.redirect_uri,
});

export { oauthClient };
