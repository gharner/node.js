import * as Sentry from '@sentry/google-cloud-serverless';
import * as dotenv from 'dotenv';
import Express from 'express';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import fs from 'fs';
import path from 'path';

import { dailyJobs, violationsJob } from './controllers';
import { TwilioController } from './controllers/twilio.controller';
import { cors, errorHandler } from './middleware';
import { routes } from './routes';

/**
 * Load local env files for emulator/dev only.
 */
(function loadLocalEnv() {
	const isEmulator = !!process.env.FUNCTIONS_EMULATOR;
	if (!isEmulator) return;

	const forcedEnvFile = process.env.ENV_FILE?.trim();
	const candidates = forcedEnvFile ? [forcedEnvFile] : ['.env.dev', '.env.gregharner', '.env'];

	for (const file of candidates) {
		const fullPath = path.resolve(process.cwd(), file);
		if (fs.existsSync(fullPath)) {
			dotenv.config({ path: fullPath });
			console.log(`Loaded environment file: ${file}`);
			break;
		}
	}
})();

// Initialize Sentry
const isProd = process.env['GCLOUD_PROJECT'] === 'valiant-splicer-224515';

Sentry.init({
	dsn: 'https://3bc129af82c1d7ef8f769984a04535df@o4508904065204224.ingest.us.sentry.io/4508989823451136',
	enabled: isProd,
	environment: isProd ? 'production' : 'development',
	release: '2025-03-19',
	tracesSampleRate: 1.0,
});

const wrapWithSentry = (fn: Function) => {
	return async (...args: any[]) => {
		try {
			return await fn(...args);
		} catch (error) {
			Sentry.captureException(error);
			throw error;
		}
	};
};

/**
 * Express route-based HTTPS functions (Gen2)
 */
routes.forEach(routerObj => {
	const app = Express();

	app.use(cors);
	app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'ejs');

	app.use(Express.json({ limit: '1mb' }));
	app.use(Express.urlencoded({ extended: false }));

	app.use(routerObj.router);

	app.all('*', (req, res) => {
		res.status(404).json({ error: 'Route not found' });
	});

	app.use(errorHandler);

	exports[routerObj.name] = onRequest(
		{
			region: 'us-central1',
		},
		async (req, res) => {
			try {
				await new Promise((resolve, reject) => {
					app(req, res, err => (err ? reject(err) : resolve(null)));
				});
			} catch (error) {
				Sentry.captureException(error);
				res.status(500).send('Internal Server Error');
			}
		},
	);
});

/**
 * Scheduled job: Monday to Friday at 9 AM
 */
export const scheduledFunction = onSchedule(
	{
		schedule: '0 9 * * 1-5',
		region: 'us-central1',
	},
	wrapWithSentry(async () => {
		if (process.env['GCLOUD_PROJECT'] === 'valiant-splicer-224515') {
			await dailyJobs();
		}
	}),
);

/**
 * Scheduled job: Saturday at 1 AM
 */
export const scheduledSaturdayFunction = onSchedule(
	{
		schedule: '0 1 * * 6',
		region: 'us-central1',
	},
	wrapWithSentry(async () => {
		if (process.env['GCLOUD_PROJECT'] === 'valiant-splicer-224515') {
			await dailyJobs();
		}
	}),
);

/**
 * Scheduled violations job
 */
export const scheduledViolationsJob = onSchedule(
	{
		schedule: '0 16,17,18,19,20,21 * * 1-6',
		region: 'us-central1',
	},
	wrapWithSentry(async () => {
		if (process.env['GCLOUD_PROJECT'] === 'valiant-splicer-224515') {
			await violationsJob();
		}
	}),
);

/**
 * Return non-sensitive environment variables
 */
export const currentEnvironment = onRequest(
	{
		region: 'us-central1',
	},
	async (request, response) => {
		try {
			cors(request, response, () => {
				const keysToExclude: string[] = ['CLIENT_SECRET', 'DATABASE_PASSWORD', 'API_KEY', 'CLIENT_ID', 'TWILIO_AUTH_TOKEN', 'TWILIO_ACCOUNT_SID', 'TWILIO_MESSAGING_SERVICE_SID'];

				const envVars: Record<string, string | undefined> = Object.keys(process.env).reduce(
					(acc, key) => {
						if (!keysToExclude.includes(key)) {
							acc[key] = process.env[key];
						}
						return acc;
					},
					{} as Record<string, string | undefined>,
				);

				response.json(envVars);
			});
		} catch (error) {
			Sentry.captureException(error);
			response.status(500).send('Internal Server Error');
		}
	},
);

/**
 * Twilio Firestore Trigger (already Gen2)
 */
const twilioController = TwilioController.getInstance();

export const sendMessage = onDocumentCreated(
	{
		document: 'sms_messages/{messageId}',
		region: 'us-central1',
		secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID'],
	},
	async event => {
		if (!event.data) return;
		await twilioController.processFirestoreMessage(event.data.ref);
	},
);
