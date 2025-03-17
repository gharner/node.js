import * as Sentry from '@sentry/google-cloud-serverless';
import axios, { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions';
import { GaxiosResponse } from 'gaxios';
import { google } from 'googleapis';
import { xml2json } from 'xml-js';
import { admin } from '../middleware/firebase';

// Initialize Sentry
Sentry.init({
	dsn: 'https://3bc129af82c1d7ef8f769984a04535df@o4508904065204224.ingest.us.sentry.io/4508989823451136',
	tracesSampleRate: 1.0,
});

/**
 * Fetches an access token using a Google API refresh token and stores it in Firestore.
 */
export const accessToken = async (request: Request, response: Response) => {
	try {
		const gapirefreshtoken = request.headers.gapirefreshtoken as string;
		if (!gapirefreshtoken) {
			throw new Error('Missing refresh token in request headers.');
		}

		const refresh_token = { refresh_token: gapirefreshtoken };
		const REDIRECT = process.env.FUNCTIONS_EMULATOR ? 'http://127.0.0.1:5001/gregharner-84eb9/us-central1/gapi/oAuthCallback' : process.env.REDIRECT_URI;

		const oAuth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, REDIRECT);

		oAuth2Client.setCredentials(refresh_token);

		const credentials = (await oAuth2Client.getAccessToken()) as {
			token?: string | null;
			res?: GaxiosResponse | null;
			errorRedactor?: false;
		};

		if (!credentials.token) {
			throw new Error('Failed to retrieve access token from Google API.');
		}

		if (process.env.FUNCTIONS_EMULATOR) {
			logger.log(`credentials=${JSON.stringify(credentials, null, 2)}`);
		}

		const token = credentials.token;
		const info = await oAuth2Client.getTokenInfo(token);

		if (process.env.FUNCTIONS_EMULATOR) {
			logger.log(`info=${JSON.stringify(info, null, 2)}`);
		}

		const accountQuery = await admin.firestore().collection('mas-accounts').where('emailAddresses.value', '==', info.email).get();

		const accountData = accountQuery.docs.pop()?.data();
		const account = accountData?.id;

		if (!account) {
			throw new Error(`No account found for email: ${info.email}`);
		}

		await admin
			.firestore()
			.collection('mas-accounts')
			.doc(account)
			.set({ mas: { gapi: { token: credentials.res?.data } } }, { merge: true });

		response.status(200).send(token);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in accessToken:', error);
		response.status(500).send({ error: 'Failed to retrieve access token' });
	}
};

/**
 * Creates a Google Group.
 */
export const addGroup = async (request: Request, response: Response) => {
	try {
		const { bearer, email, group } = request.headers;
		if (!bearer || !email || !group) {
			throw new Error('Missing required headers: bearer, email, or group.');
		}

		const postData = JSON.stringify({ email, name: group });

		if (process.env.FUNCTIONS_EMULATOR) {
			logger.log(`postData=${JSON.stringify(postData, null, 2)}`);
		}

		const axiosResponse: AxiosResponse = await axios.post('https://admin.googleapis.com/admin/directory/v1/groups/', postData, {
			headers: {
				Authorization: `Bearer ${bearer}`,
				'Content-Type': 'application/json',
			},
		});

		response.send(axiosResponse.data);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in addGroup:', error);
		response.status(500).send({ error: 'Failed to add Google group' });
	}
};

/**
 * Adds a member to a Google Group.
 */
export const addMember = async (request: Request, response: Response) => {
	try {
		const { bearer, email, group } = request.headers;
		if (!bearer || !email || !group) {
			throw new Error('Missing required headers: bearer, email, or group.');
		}

		const postData = JSON.stringify({ email });

		if (process.env.FUNCTIONS_EMULATOR) {
			logger.log(`postData=${JSON.stringify(postData, null, 2)}`);
		}

		const axiosResponse: AxiosResponse = await axios.post(`https://admin.googleapis.com/admin/directory/v1/groups/${group}/members`, postData, {
			headers: {
				Authorization: `Bearer ${bearer}`,
				'Content-Type': 'application/json',
			},
		});

		response.send(axiosResponse.data);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in addMember:', error);
		response.status(500).send({ error: 'Failed to add member to Google group' });
	}
};

/**
 * Retrieves the members of the Google Domain Directory.
 */
export const directory = async (request: Request, response: Response) => {
	try {
		const { bearer } = request.headers;
		if (!bearer) {
			throw new Error('Missing required header: bearer.');
		}

		const axiosResponse: AxiosResponse = await axios.get('https://www.google.com/m8/feeds/contacts/yongsa.net/full', {
			headers: {
				Authorization: `Bearer ${bearer}`,
				'GData-Version': '3.0',
			},
		});

		const obj = xml2json(axiosResponse.data, { compact: true, spaces: 2 });
		response.send(obj);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in directory:', error);
		response.status(500).send({ error: 'Failed to retrieve directory' });
	}
};

/**
 * Retrieves events from a Google Calendar.
 */
export const events = async (request: Request, response: Response) => {
	try {
		const { bearer, calendar, start, filter } = request.headers;
		if (!bearer || !calendar || !start) {
			throw new Error('Missing required headers: bearer, calendar, or start.');
		}

		const axiosResponse: AxiosResponse = await axios.get(`https://www.googleapis.com/calendar/v3/calendars/${calendar}/events`, {
			params: {
				maxResults: 2500,
				singleEvents: true,
				q: filter?.toString().replace(' ', '%20'),
				timeMin: start,
			},
			headers: {
				Authorization: `Bearer ${bearer}`,
			},
		});

		response.send(axiosResponse.data);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in events:', error);
		response.status(500).send({ error: 'Failed to retrieve events' });
	}
};

/**
 * Generates a Google login URL for OAuth2 authentication.
 */
export const googleLogin = (request: Request, response: Response) => {
	try {
		const SCOPES = process.env.SCOPES;
		if (!SCOPES) {
			throw new Error('Google OAuth SCOPES are not defined in environment variables.');
		}

		const REDIRECT = process.env.FUNCTIONS_EMULATOR ? `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT}/us-central1/gapi/oAuthCallback` : process.env.REDIRECT_URI;

		const oAuth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, REDIRECT);

		const authUrl = oAuth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: SCOPES,
			prompt: 'consent',
		});

		if (process.env.FUNCTIONS_EMULATOR) {
			logger.log(authUrl);
		}

		response.set('Cache-Control', 'private, max-age=0, s-maxage=0');
		response.send(authUrl);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in googleLogin:', error);
		response.status(500).send({ error: 'Failed to generate Google login URL' });
	}
};

/**
 * Retrieves Google Group information.
 */
export const group = async (request: Request, response: Response) => {
	try {
		const { bearer, group } = request.headers;
		if (!bearer || !group) {
			throw new Error('Missing required headers: bearer or group.');
		}

		const axiosResponse: AxiosResponse = await axios.get(`https://admin.googleapis.com/admin/directory/v1/groups/${group}`, {
			headers: {
				Authorization: `Bearer ${bearer}`,
			},
		});

		response.send(axiosResponse.data);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in group:', error);
		response.status(500).send({ error: 'Failed to retrieve group information' });
	}
};

/**
 * Retrieves members of a Google Group.
 */
export const members = async (request: Request, response: Response) => {
	try {
		const { bearer, group, nextPage } = request.headers;
		if (!bearer || !group) {
			throw new Error('Missing required headers: bearer or group.');
		}

		const params: any = {
			maxResults: 2500,
		};
		if (nextPage) {
			params.pageToken = nextPage;
		}

		if (process.env.FUNCTIONS_EMULATOR) {
			logger.log(`bearer=${bearer}`);
			logger.log(`group=${group}`);
			logger.log(`nextPage=${nextPage}`);
		}

		const axiosResponse: AxiosResponse = await axios.get(`https://admin.googleapis.com/admin/directory/v1/groups/${group}/members`, {
			params,
			headers: {
				Authorization: `Bearer ${bearer}`,
			},
		});

		response.send(axiosResponse.data);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in members:', error);
		response.status(500).send({ error: 'Failed to retrieve group members' });
	}
};

/**
 * Handles the Google OAuth2 redirect callback.
 */
export const oAuthCallback = async (request: Request, response: Response) => {
	try {
		const { error, code } = request.query;
		if (error) {
			response.status(500).send(error);
			return;
		}

		if (!code) {
			throw new Error('Authorization code is missing.');
		}

		const REDIRECT = process.env.FUNCTIONS_EMULATOR ? `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT}/us-central1/gapi/oAuthCallback` : process.env.REDIRECT_URI;

		const oAuth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, REDIRECT);

		// Exchange the authorization code for an access token.
		const { tokens } = await oAuth2Client.getToken(code as string);
		oAuth2Client.setCredentials(tokens);

		const oauth2 = google.oauth2({
			auth: oAuth2Client,
			version: 'v2',
		});

		// Get the user's email address and Google user ID
		const { data } = await oauth2.userinfo.get();
		const { email } = data;

		if (!email) {
			throw new Error('Failed to retrieve email from Google OAuth.');
		}

		// Find account in Firestore
		const accountQuery = await admin.firestore().collection('mas-accounts').where('emailAddresses.value', '==', email).get();

		const accountData = accountQuery.docs.pop()?.data();
		if (process.env.FUNCTIONS_EMULATOR) {
			logger.log(accountData);
		}

		const account = accountData?.id;
		if (!account) {
			throw new Error(`No account found for email: ${email}`);
		}

		// Store user data and tokens in Firestore
		await admin
			.firestore()
			.collection('mas-accounts')
			.doc(account)
			.set({ mas: { gapi: { user: data, token: tokens } } }, { merge: true });

		const html_response = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Google Token Response</title>
        <script>window.close();</script>
      </head>
      <body>
        <h4>New Token Issued</h4>
      </body>
      </html>
    `;

		response.send(html_response);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in oAuthCallback:', error);
		response.status(500).send({ error: 'OAuth callback failed' });
	}
};

/**
 * Removes a member from a Google Group.
 */
export const removeMember = async (request: Request, response: Response) => {
	try {
		const { bearer, email, group } = request.headers;
		if (!bearer || !email || !group) {
			throw new Error('Missing required headers: bearer, email, or group.');
		}

		const axiosResponse: AxiosResponse = await axios.delete(`https://admin.googleapis.com/admin/directory/v1/groups/${group}/members/${email}`, {
			headers: {
				Authorization: `Bearer ${bearer}`,
			},
		});

		response.send(axiosResponse.data);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in removeMember:', error);
		response.status(500).send({ error: 'Failed to remove member' });
	}
};

/**
 * Creates a shared Google Contact.
 */
export const createSharedContact = async (request: Request, response: Response) => {
	try {
		const { bearer } = request.headers;
		const { email, name } = request.body;
		if (!bearer || !email || !name) {
			throw new Error('Missing required headers or body parameters: bearer, email, or name.');
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

		const axiosResponse: AxiosResponse = await axios.post('https://www.google.com/m8/feeds/contacts/yongsa.net/full', contactXML, {
			headers: {
				Authorization: `Bearer ${bearer}`,
				'GData-Version': '3.0',
				'Content-Type': 'application/atom+xml',
			},
		});

		logger.log('Contact created successfully:', axiosResponse.data);
		response.send(axiosResponse.data);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in createSharedContact:', error);
		response.status(500).send({ error: 'Failed to create shared contact' });
	}
};

/**
 * Removes a shared Google Contact.
 */
export const removeSharedContact = async (request: Request, response: Response) => {
	try {
		const { bearer } = request.headers;
		const { id } = request.body;
		if (!bearer || !id) {
			throw new Error('Missing required headers or body parameters: bearer or id.');
		}

		const axiosResponse: AxiosResponse = await axios.delete(`https://www.google.com/m8/feeds/contacts/yongsa.net/base/${id}`, {
			headers: {
				Authorization: `OAuth ${bearer}`,
				'If-Match': '*',
			},
		});

		logger.log('Shared contact removed:', axiosResponse.data);
		response.send(axiosResponse.data);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in removeSharedContact:', error);
		response.status(500).send({ error: 'Failed to remove shared contact' });
	}
};
