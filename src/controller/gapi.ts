import https from 'https';
import { Request, Response } from 'express';
import { admin } from '../middleware/firebase';
import { google } from 'googleapis';
import { xml2json } from 'xml-js';
import { GaxiosResponse } from 'gaxios';
import { logger } from 'firebase-functions';

export const googleLogin = (request: Request, response: Response) => {
	const SCOPES = process.env.SCOPES;

	const oAuth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, process.env.REDIRECT_URI);

	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
		prompt: 'consent',
	});
	response.set('Cache-Control', 'private, max-age=0, s-maxage=0');
	response.send(authUrl);
};

export const oAuthCallback = async (request: Request, response: Response) => {
	const { query: { error, code } = {} } = request;

	// what firebase project is initialized?
	logger.log(admin);

	// User may deny access to the application.
	if (error) {
		response.status(500).send(error);
		return;
	}

	// I'm trying to get this to work with the emulator. It currently does not work.
	const REDIRECT = process.env.FUNCTIONS_EMULATOR ? 'http://127.0.0.1:5001/gregharner-84eb9/us-central1/gapi/oAuthCallback' : process.env.REDIRECT_URI;

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
	// Set merge: true to not overwrite any other data in the same document
	const accountByEmail = admin.firestore().collection('mas-accounts').where('emailAddresses.value', '==', email).get();

	const accountData = (await accountByEmail).docs.pop()?.data();
	logger.log(accountData);

	const account = accountData?.id;

	try {
		const accountsCollection = admin.firestore().collection('mas-accounts');
		await accountsCollection.doc(<string>account).set({ mas: { gapi: { user: data, token: tokens } } }, { merge: true });

		const html_response =
			'<!DOCTYPE html><html lang="en"><head><title>Google Token Response</title><script>window.close();</script></head><body><h4>New Token Issued</h4></body></html>';
		response.send(html_response);
	} catch (error) {
		response.status(400).send(email);
	}
};

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

		logger.log(`credentials=${credentials}`);

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

export const members = async (request: Request, response: Response) => {
	const { bearer } = request.headers;
	const { group } = request.headers;
	const { nextPage } = request.headers;

	var options = {
		method: 'GET',
		hostname: 'admin.googleapis.com',
		path: `/admin/directory/v1/groups/${group}/members?&maxResults=2500&nextPageToken=${nextPage}`,
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
