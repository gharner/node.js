import axios, { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { GaxiosResponse } from 'gaxios';
import { google } from 'googleapis';
import { xml2json } from 'xml-js';
import { admin } from '../modules';

/**
 * Validates required environment variables
 */
const validateEnv = (variables: string[]): void => {
	const missing = variables.filter(v => !process.env[v]);
	if (missing.length > 0) {
		throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
	}
};

/**
 * Gets the appropriate redirect URI based on environment
 */
const getRedirectUri = (): string => {
	return process.env.FUNCTIONS_EMULATOR ? `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT}/us-central1/gapi/oAuthCallback` : process.env.REDIRECT_URI || '';
};

/**
 * Creates OAuth2 client with validated credentials
 */
const createOAuth2Client = (): any => {
	validateEnv(['CLIENT_ID', 'CLIENT_SECRET']);
	const redirect = getRedirectUri();
	return new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, redirect);
};

/**
 * Logs debug info if in emulator mode
 */
const debugLog = (message: string, data?: any): void => {
	if (process.env.FUNCTIONS_EMULATOR) {
		logger.log(`${message}=${data ? JSON.stringify(data, null, 2) : ''}`);
	}
};

/**
 * Gets access token using refresh token from request headers
 */
export const accessToken = async (request: Request, response: Response): Promise<void> => {
	const gapirefreshtoken = request.headers.gapirefreshtoken as string;

	if (!gapirefreshtoken) {
		response.status(400).send({ error: 'Missing gapirefreshtoken header' });
		return;
	}

	try {
		const oAuth2Client = createOAuth2Client();
		oAuth2Client.setCredentials({ refresh_token: gapirefreshtoken });

		const credentials = (await oAuth2Client.getAccessToken()) as {
			token?: string | null;
			res?: GaxiosResponse | null;
		};

		debugLog('credentials', credentials);

		const token = credentials.token;

		if (!token) {
			throw new Error('Failed to retrieve access token');
		}

		const info = await oAuth2Client.getTokenInfo(token);
		debugLog('info', info);

		if (!info.email) {
			throw new Error('No email found in token info');
		}

		const accountByEmail = admin.firestore().collection('mas-accounts').where('emailAddresses.value', '==', info.email).get();
		const accountData = (await accountByEmail).docs.pop()?.data();
		const account = accountData?.id;

		if (!account) {
			throw new Error(`No account found for email: ${info.email}`);
		}

		const accountsCollection = admin.firestore().collection('mas-accounts');
		await accountsCollection.doc(account).set({ mas: { gapi: { token: credentials.res?.data } } }, { merge: true });

		response.status(200).send({ token });
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error getting accessToken:', additionalInfo);
		response.status(500).send({
			error: 'Failed to get accessToken',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Creates a new Google Group
 */
export const addGroup = async (request: Request, response: Response): Promise<void> => {
	const bearer = request.headers.authorization?.replace('Bearer ', '') || (request.headers.bearer as string);
	const email = request.headers.email as string;
	const group = request.headers.group as string;

	if (!bearer || !email || !group) {
		response.status(400).send({ error: 'Missing required headers: bearer, email, group' });
		return;
	}

	const postData = JSON.stringify({ email, name: group });
	debugLog('postData', postData);

	try {
		const axiosResponse: AxiosResponse = await axios.post('https://admin.googleapis.com/admin/directory/v1/groups/', postData, {
			headers: {
				Authorization: `Bearer ${bearer}`,
				'Content-Type': 'application/json',
			},
		});

		response.status(200).send(axiosResponse.data);
	} catch (e) {
		const additionalInfo = {
			bearerToken: `Bearer ${bearer.substring(0, 10)}...`,
			group,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error addGroup:', additionalInfo);
		response.status(500).send({
			error: 'Failed to add group',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Adds a member to a Google Group
 */
export const addMember = async (request: Request, response: Response): Promise<void> => {
	const bearer = request.headers.authorization?.replace('Bearer ', '') || (request.headers.bearer as string);
	const email = request.headers.email as string;
	const group = request.headers.group as string;

	if (!bearer || !email || !group) {
		response.status(400).send({ error: 'Missing required headers: bearer, email, group' });
		return;
	}

	const postData = JSON.stringify({ email });
	debugLog('postData', postData);

	try {
		const axiosResponse: AxiosResponse = await axios.post(`https://admin.googleapis.com/admin/directory/v1/groups/${group}/members`, postData, {
			headers: {
				Authorization: `Bearer ${bearer}`,
				'Content-Type': 'application/json',
			},
		});

		response.status(200).send(axiosResponse.data);
	} catch (e) {
		const additionalInfo = {
			email,
			group,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error addMember:', additionalInfo);
		response.status(500).send({
			error: 'Failed to add member',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Gets the members of the Domain Directory
 */
export const directory = async (request: Request, response: Response): Promise<void> => {
	const bearer = request.headers.authorization?.replace('Bearer ', '') || (request.headers.bearer as string);

	if (!bearer) {
		response.status(400).send({ error: 'Missing authorization header' });
		return;
	}

	try {
		const axiosResponse: AxiosResponse = await axios.get('https://www.google.com/m8/feeds/contacts/yongsa.net/full', {
			headers: {
				Authorization: `Bearer ${bearer}`,
				'GData-Version': '3.0',
			},
		});

		const obj = xml2json(axiosResponse.data, { compact: true, spaces: 2 });
		response.status(200).send(obj);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error getting directory:', additionalInfo);
		response.status(500).send({
			error: 'Failed to get directory',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Gets events from the shared calendar
 */
export const events = async (request: Request, response: Response): Promise<void> => {
	const bearer = request.headers.authorization?.replace('Bearer ', '') || (request.headers.bearer as string);
	const calendar = request.headers.calendar as string;
	const start = request.headers.start as string;
	const filter = request.headers.filter as string;

	if (!bearer || !calendar || !start) {
		response.status(400).send({ error: 'Missing required headers: bearer, calendar, start' });
		return;
	}

	try {
		const axiosResponse: AxiosResponse = await axios.get(`https://www.googleapis.com/calendar/v3/calendars/${calendar}/events`, {
			params: {
				maxResults: 2500,
				singleEvents: true,
				q: filter,
				timeMin: start,
			},
			headers: {
				Authorization: `Bearer ${bearer}`,
			},
		});

		response.status(200).send(axiosResponse.data);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error getting events:', additionalInfo);
		response.status(500).send({
			error: 'Failed to get events',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Gets the authorization URL to initialize GAPI authorization routine
 */
export const googleLogin = (request: Request, response: Response): void => {
	try {
		validateEnv(['SCOPES', 'CLIENT_ID', 'CLIENT_SECRET']);

		const scopes = process.env.SCOPES?.split(',') || [];
		const oAuth2Client = createOAuth2Client();

		const authUrl = oAuth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: scopes,
			prompt: 'consent',
		});

		debugLog('authUrl', authUrl);

		response.set('Cache-Control', 'private, max-age=0, s-maxage=0');
		response.status(200).send({ authUrl });
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in googleLogin:', additionalInfo);
		response.status(500).send({
			error: 'Failed to generate login URL',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Gets Google Group information
 */
export const group = async (request: Request, response: Response): Promise<void> => {
	const bearer = request.headers.authorization?.replace('Bearer ', '') || (request.headers.bearer as string);
	const groupEmail = request.headers.group as string;

	if (!bearer || !groupEmail) {
		response.status(400).send({ error: 'Missing required headers: bearer, group' });
		return;
	}

	try {
		const axiosResponse: AxiosResponse = await axios.get(`https://admin.googleapis.com/admin/directory/v1/groups/${groupEmail}`, {
			headers: {
				Authorization: `Bearer ${bearer}`,
			},
		});

		response.status(200).send(axiosResponse.data);
	} catch (e) {
		const additionalInfo = {
			groupEmail,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error getting group:', additionalInfo);
		response.status(500).send({
			error: 'Failed to get group',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Gets Google Group Members information
 */
export const members = async (request: Request, response: Response): Promise<void> => {
	const bearer = request.headers.authorization?.replace('Bearer ', '') || (request.headers.bearer as string);
	const group = request.headers.group as string;
	const nextPage = request.headers.nextpage as string;

	if (!bearer || !group) {
		response.status(400).send({ error: 'Missing required headers: bearer, group' });
		return;
	}

	const params: any = {
		maxResults: 2500,
	};

	if (nextPage) {
		params.pageToken = nextPage;
	}

	debugLog('bearer', `Bearer ${bearer.substring(0, 10)}...`);
	debugLog('group', group);
	debugLog('nextPage', nextPage);

	try {
		const axiosResponse: AxiosResponse = await axios.get(`https://admin.googleapis.com/admin/directory/v1/groups/${group}/members`, {
			params,
			headers: {
				Authorization: `Bearer ${bearer}`,
			},
		});

		response.status(200).send(axiosResponse.data);
	} catch (e) {
		const additionalInfo = {
			group,
			url: `https://admin.googleapis.com/admin/directory/v1/groups/${group}/members`,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error getting members:', additionalInfo);
		response.status(500).send({
			error: 'Failed to get members',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Handles OAuth2 callback redirect
 */
export const oAuthCallback = async (request: Request, response: Response): Promise<void> => {
	const { error, code } = request.query as { error?: string; code?: string };

	if (error) {
		response.status(400).send({ error: `OAuth error: ${error}` });
		return;
	}

	if (!code) {
		response.status(400).send({ error: 'Missing authorization code' });
		return;
	}

	try {
		const oAuth2Client = createOAuth2Client();
		const { tokens } = await oAuth2Client.getToken(code);
		oAuth2Client.setCredentials(tokens);

		const oauth2 = google.oauth2({
			auth: oAuth2Client,
			version: 'v2',
		});

		const { data } = await oauth2.userinfo.get();
		const { email } = data;

		if (!email) {
			throw new Error('Missing email from userinfo');
		}

		const snapshot = await admin.firestore().collection('mas-accounts').where('emailAddresses.value', '==', email).get();

		const accountData = snapshot.docs.pop()?.data();
		const account = accountData?.id;

		if (!account) {
			throw new Error(`No matching mas-account found for email: ${email}`);
		}

		await admin
			.firestore()
			.collection('mas-accounts')
			.doc(account)
			.set({ mas: { gapi: { user: data, token: tokens } } }, { merge: true });

		const htmlResponse = `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<title>Google Token Response</title>
				<script>window.close();</script>
			</head>
			<body>
				<h4>New Token Issued</h4>
			</body>
			</html>`;

		response.status(200).send(htmlResponse);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in oAuthCallback:', additionalInfo);
		response.status(500).send({
			error: 'OAuth callback failed',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Removes a member from a Google Group
 */
export const removeMember = async (request: Request, response: Response): Promise<void> => {
	const bearer = request.headers.authorization?.replace('Bearer ', '') || (request.headers.bearer as string);
	const email = request.headers.email as string;
	const group = request.headers.group as string;

	if (!bearer || !email || !group) {
		response.status(400).send({ error: 'Missing required headers: bearer, email, group' });
		return;
	}

	try {
		const axiosResponse: AxiosResponse = await axios.delete(`https://admin.googleapis.com/admin/directory/v1/groups/${group}/members/${email}`, {
			headers: {
				Authorization: `Bearer ${bearer}`,
			},
		});

		response.status(200).send(axiosResponse.data);
	} catch (e) {
		const additionalInfo = {
			email,
			group,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error removing member:', additionalInfo);
		response.status(500).send({
			error: 'Failed to remove member',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Creates a shared contact in Google Contacts
 */
export const createSharedContact = async (request: Request, response: Response): Promise<void> => {
	const bearer = request.headers.authorization?.replace('Bearer ', '') || (request.headers.bearer as string);
	const { email, name } = request.body as { email?: string; name?: string };

	if (!bearer || !email || !name) {
		response.status(400).send({ error: 'Missing required data: bearer token, email, name' });
		return;
	}

	const contactXML = `
		<atom:entry xmlns:atom='http://www.w3.org/2005/Atom'
									xmlns:gd='http://schemas.google.com/g/2005'>
			<atom:category scheme='http://schemas.google.com/g/2005#kind'
				term='http://schemas.google.com/contact/2008#contact'/>
			<gd:name>
				<gd:fullName>${name}</gd:fullName>
			</gd:name>
			<gd:email rel='http://schemas.google.com/g/2005#work'
				primary='true'
				address='${email}' />
		</atom:entry>`;

	try {
		const axiosResponse: AxiosResponse = await axios.post('https://www.google.com/m8/feeds/contacts/yongsa.net/full', contactXML, {
			headers: {
				Authorization: `Bearer ${bearer}`,
				'GData-Version': '3.0',
				'Content-Type': 'application/atom+xml',
			},
		});

		logger.log('Contact created successfully');
		response.status(200).send(axiosResponse.data);
	} catch (e) {
		const additionalInfo = {
			email,
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error creating shared contact:', additionalInfo);
		response.status(500).send({
			error: 'Failed to create shared contact',
			details: additionalInfo.originalError,
		});
	}
};

/**
 * Removes a shared contact from Google Contacts
 * Note: Currently untested and not fully implemented
 */
export const removeSharedContact = async (request: Request, response: Response): Promise<void> => {
	const bearer = request.headers.authorization?.replace('Bearer ', '') || (request.headers.bearer as string);
	const { id } = request.body as { id?: string };

	if (!bearer || !id) {
		response.status(400).send({ error: 'Missing required data: bearer token, id' });
		return;
	}

	try {
		const axiosResponse: AxiosResponse = await axios.delete(`https://www.google.com/m8/feeds/contacts/yongsa.net/base/${id}`, {
			headers: {
				Authorization: `OAuth ${bearer}`,
				'If-Match': '*',
			},
		});

		logger.log('Contact removed successfully');
		response.status(200).send(axiosResponse.data);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error removing shared contact:', additionalInfo);
		response.status(500).send({
			error: 'Failed to remove shared contact',
			details: additionalInfo.originalError,
		});
	}
};
