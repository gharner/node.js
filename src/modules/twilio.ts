import { initializeApp } from 'firebase-admin/app';
import { defineSecret } from 'firebase-functions/params';
import { Twilio } from 'twilio';

// Define your secrets
const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');

let initialized = false;
export let twilioClient: Twilio;

export async function initialize(): Promise<void> {
	if (initialized) {
		return;
	}

	const accountSid = twilioAccountSid.value();
	const authToken = twilioAuthToken.value();

	if (accountSid && authToken) {
		initializeApp();
		twilioClient = new Twilio(accountSid, authToken, {
			lazyLoading: true,
		});
		initialized = true;
		return;
	} else {
		throw new Error(`One or more of the Twilio API Key or Auth Token is missing. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN secrets.`);
	}
}

export function getFunctionsUrl(functionName: string): string {
	if (process.env.IS_FIREBASE_CLI) {
		const baseUrl = process.env.HTTP_TUNNEL ? `https://${process.env.HTTP_TUNNEL}/` : 'http://localhost:5001/';
		return `${baseUrl}${process.env.PROJECT_ID}/${process.env.LOCATION}/${functionName}`;
	} else {
		return `https://${process.env.LOCATION}-${process.env.PROJECT_ID}.cloudfunctions.net/${functionName}`;
	}
}
