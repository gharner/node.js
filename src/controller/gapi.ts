import https from 'https';
import { Request, Response } from 'express';
import { admin } from '../middleware/firebase';
import { google } from 'googleapis';
import { xml2json } from 'xml-js';
import { GaxiosResponse } from 'gaxios';
import { logger } from 'firebase-functions';

// Using GAPI authorization URL get token information and store it in Firecloud
export const accessToken = async (request: Request, response: Response) => {
	const gapirefreshtoken = request.headers.gapirefreshtoken;
	const refresh_token = { refresh_token: <string>gapirefreshtoken };

	try {
		const REDIRECT = process.env.FUNCTIONS_EMULATOR ? 'http://127.0.0.1:5001/gregharner-84eb9/us-central1/gapi/oAuthCallback' : process.env.REDIRECT_URI;

		const oAuth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, REDIRECT);

		oAuth2Client.setCredentials(refresh_token);

		const credentials = (await oAuth2Client.getAccessToken()) as {
			token?: string | null;
			res?: GaxiosResponse | null;
			errorRedactor?: false;
		};

		if (process.env.FUNCTIONS_EMULATOR) {
			logger.log(`credentials=${JSON.stringify(credentials, null, 2)}`);
		}

		const token = credentials.token;

		const info = await oAuth2Client.getTokenInfo(<string>token);

		const accountByEmail = admin.firestore().collection('mas-accounts').where('emailAddresses.value', '==', info.email).get();
		const accountData = (await accountByEmail).docs.pop()?.data();
		const account = accountData?.id;

		const accountsCollection = admin.firestore().collection('mas-accounts');
		await accountsCollection.doc(<string>account).set({ mas: { gapi: { token: credentials.res?.data } } }, { merge: true });

		response.status(200).send(token);
	} catch (error: any) {
		response.status(400).send(error);
	}
};

export const addGroup = async (request: Request, response: Response) => {
	const { bearer } = request.headers;
	const { email } = request.headers;
	const { group } = request.headers;

	var options = {
		method: 'POST',
		hostname: 'admin.googleapis.com',
		path: `/admin/directory/v1/groups/`,

		headers: {
			Authorization: `Bearer ${bearer}`,
		},
	};

	const callback = (res: any) => {
		var data = '';

		res.on('data', (chunk: any) => {
			data += chunk;
		});

		res.on('end', () => {
			response.send(data);
		});

		res.on('error', (error: any) => {
			logger.log(error);
		});
	};

	const postData = JSON.stringify({
		email: email,
		name: group,
	});

	const req = https.request(options, callback);
	req.write(postData);
	req.end();
};

// Add member to group given in request header
export const addMember = async (request: Request, response: Response) => {
	const { bearer } = request.headers;
	const { email } = request.headers;
	const { group } = request.headers;

	var options = {
		method: 'POST',
		hostname: 'admin.googleapis.com',
		path: `/admin/directory/v1/groups/${group}/members`,

		headers: {
			Authorization: `Bearer ${bearer}`,
		},
	};

	const callback = (res: any) => {
		var data = '';

		res.on('data', (chunk: any) => {
			data += chunk;
		});

		res.on('end', () => {
			response.send(data);
		});

		res.on('error', (error: any) => {
			logger.log(error);
		});
	};

	const postData = JSON.stringify({
		email: email,
	});

	const req = https.request(options, callback);
	req.write(postData);
	req.end();
};

// get the member of the Domain Directory
export const directory = async (request: Request, response: Response) => {
	const { bearer } = request.headers;

	var options = {
		method: 'GET',
		hostname: 'www.google.com',
		path: `/m8/feeds/contacts/yongsa.net/full`,

		headers: {
			Authorization: `Bearer ${bearer}`,
		},
	};

	const callback = (result: any) => {
		let str = '';

		//another chunk of data has been received, so append it to `str`
		result.on('data', (chunk: any) => {
			str += chunk;
		});

		//the whole response has been received, so we just print it out here
		result.on('end', () => {
			const obj: any = xml2json(str, { compact: true, spaces: 2 });
			response.send(obj);
		});
	};

	https.request(options, callback).end();
};

// Get events from the Yongsa shared calendar
export const events = async (request: Request, response: Response) => {
	const { bearer } = request.headers;
	const { calendar } = request.headers;
	const { start } = request.headers;
	const { filter } = request.headers;

	var options = {
		method: 'GET',
		hostname: 'www.googleapis.com',
		path: `/calendar/v3/calendars/${calendar}/events?maxResults=2500&singleEvents=true&q=${filter?.toString().replace(' ', '%20')}&timeMin=${start}`,

		headers: {
			Authorization: `Bearer ${bearer}`,
		},
	};

	const callback = (result: any) => {
		let str = '';

		//another chunk of data has been received, so append it to `str`
		result.on('data', (chunk: any) => {
			str += chunk;
		});

		//the whole response has been received, so we just print it out here
		result.on('end', () => {
			response.send(str);
		});
	};

	https.request(options, callback).end();
};

// Get a URL to initialize GAPI authorization routine
export const googleLogin = (request: Request, response: Response) => {
	const SCOPES = process.env.SCOPES;

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
};

// Get Google Group information
export const group = async (request: Request, response: Response) => {
	const { bearer } = request.headers;
	const { group } = request.headers;

	var options = {
		method: 'GET',
		hostname: 'admin.googleapis.com',
		path: `admin.googleapis.com/admin/directory/v1/groups/${group}`,

		headers: {
			Authorization: `Bearer ${bearer}`,
		},
	};

	const callback = (result: any) => {
		let str = '';

		//another chunk of data has been received, so append it to `str`
		result.on('data', (chunk: any) => {
			str += chunk;
		});

		//the whole response has been received, so we just print it out here
		result.on('end', () => {
			response.send(str);
		});
	};

	https.request(options, callback).end();
};

// Get Google Group Members information
export const members = async (request: Request, response: Response) => {
	const { bearer } = request.headers;
	const { group } = request.headers;
	const { nextPage } = request.headers;

	if (process.env.FUNCTIONS_EMULATOR) {
		logger.log(`credentials=${bearer}`);
		logger.log(`credentials=${group}`);
		logger.log(`credentials=${nextPage}`);
	}

	var options = {
		method: 'GET',
		hostname: 'admin.googleapis.com',
		path: `/admin/directory/v1/groups/${group}/members?maxResults=2500` + (nextPage ? `&pageToken=${nextPage}` : ''),
		headers: {
			Authorization: `Bearer ${bearer}`,
		},
	};

	const callback = (result: any) => {
		let str = '';

		//another chunk of data has been received, so append it to `str`
		result.on('data', (chunk: any) => {
			str += chunk;
		});

		//the whole response has been received, so we just print it out here
		result.on('end', () => {
			response.send(str);
		});
	};

	https.request(options, callback).end();
};

// Handles to redirect url callback
export const oAuthCallback = async (request: Request, response: Response) => {
	const { query: { error, code } = {} } = request;

	// what firebase project is initialized?
	if (process.env.FUNCTIONS_EMULATOR) {
		logger.log('admin', admin);
	}

	// User may deny access to the application.
	if (error) {
		response.status(500).send(error);
		return;
	}

	const REDIRECT = process.env.FUNCTIONS_EMULATOR ? `http://127.0.0.1:5001/${process.env.GCLOUD_PROJECT}/us-central1/gapi/oAuthCallback` : process.env.REDIRECT_URI;

	const oAuth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, REDIRECT);

	// Exchange the authorization code for an access token.
	const { tokens } = await oAuth2Client.getToken(<string>code);

	oAuth2Client.setCredentials(tokens);

	const oauth2 = google.oauth2({
		auth: oAuth2Client,
		version: 'v2',
	});

	// Get the user's email address and Google user ID
	const { data } = await oauth2.userinfo.get();
	const { email } = data;

	// Store the refresh token in the Firestore database.
	const accountByEmail = admin.firestore().collection('mas-accounts').where('emailAddresses.value', '==', email).get();

	const accountData = (await accountByEmail).docs.pop()?.data();

	if (process.env.FUNCTIONS_EMULATOR) {
		logger.log(accountData);
	}

	const account = accountData?.id;

	try {
		const accountsCollection = admin.firestore().collection('mas-accounts');

		// Set merge: true to not overwrite any other data in the same document
		await accountsCollection.doc(<string>account).set({ mas: { gapi: { user: data, token: tokens } } }, { merge: true });

		const html_response =
			'<!DOCTYPE html><html lang="en"><head><title>Google Token Response</title><script>window.close();</script></head><body><h4>New Token Issued</h4></body></html>';
		response.send(html_response);
	} catch (error) {
		response.status(400).send(email);
	}
};

// Remove member from group given in request header
export const removeMember = async (request: Request, response: Response) => {
	const { bearer } = request.headers;
	const { email } = request.headers;
	const { group } = request.headers;

	var options = {
		method: 'DELETE',
		hostname: 'admin.googleapis.com',
		path: `/admin/directory/v1/groups/${group}/members/${email}`,

		headers: {
			Authorization: `Bearer ${bearer}`,
		},
	};

	const callback = (res: any) => {
		var data = '';

		res.on('data', (chunk: any) => {
			data += chunk;
		});

		res.on('end', () => {
			response.send(data);
		});

		res.on('error', (error: any) => {
			logger.log(error);
		});
	};

	https.request(options, callback).end();
};

export const sharedContact = async (request: Request, response: Response) => {
	const { email, name } = request.body;
	const { bearer } = request.headers;

	if (!email || !name) {
		response.status(400).send('Missing required fields');
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

	var options = {
		method: 'POST',
		hostname: 'www.google.com',
		path: `/m8/feeds/contacts/default/full`,
		headers: {
			Authorization: `Bearer ${bearer}`,
			'Content-Type': 'application/atom+xml',
		},
	};

	const req = https.request(options, res => {
		let str = '';

		res.on('data', chunk => {
			str += chunk;
		});

		res.on('end', () => {
			try {
				const obj = xml2json(str, { compact: true, spaces: 2 });
				response.send(obj);
			} catch (error) {
				response.status(500).send('Failed to parse XML response');
			}
		});

		res.on('error', error => {
			response.status(500).send(`Error: ${error.message}`);
		});
	});

	req.on('error', error => {
		response.status(500).send(`Request Error: ${error.message}`);
	});

	req.write(contactXML);
	req.end();
};
