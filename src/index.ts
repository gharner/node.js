import * as Sentry from '@sentry/google-cloud-serverless';
import * as dotenv from 'dotenv';
import Express from 'express';
import { defineSecret } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import fs from 'fs';
import path from 'path';
import { dailyJobs, violationsJob } from './controllers';
import { TwilioController } from './controllers/twilio.controller';
import { cors, errorHandler } from './middleware';
import { debugGuard } from './middleware/debug-guard.middleware';
import { routes } from './routes';

/* ======================================================
   Load .env only in emulator
====================================================== */

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

/* ======================================================
   Twilio Secrets (Gen2 Required)
====================================================== */

const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_MESSAGING_SERVICE_SID = defineSecret('TWILIO_MESSAGING_SERVICE_SID');

/* ======================================================
   Sentry Setup
====================================================== */

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

/* ======================================================
   Express Route-Based HTTPS Functions (Gen2)
====================================================== */

routes.forEach(routerObj => {
	const app = Express();

	app.use(cors);
	app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'ejs');

	/**
	 * IMPORTANT:
	 * Twilio webhook endpoints must use raw body parsing BEFORE JSON parsing.
	 * This avoids breaking Twilio signature validation.
	 */
	const isTwilioRouter = routerObj.name.toLowerCase().includes('twilio');

	if (isTwilioRouter) {
		// Parse raw first (Twilio)
		const { twilioRawBody } = require('./middleware/twilio-raw-body.middleware');
		app.use(twilioRawBody);
	} else {
		// Normal JSON parsing for all other routers
		app.use(Express.json({ limit: '1mb' }));
		app.use(Express.urlencoded({ extended: false }));
	}

	app.use(routerObj.router);

	app.all('*', (req, res) => {
		res.status(404).json({ error: 'Route not found' });
	});

	app.use(errorHandler);

	const needsTwilioSecrets = isTwilioRouter;

	exports[routerObj.name] = onRequest(
		{
			region: 'us-central1',
			secrets: needsTwilioSecrets ? [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID] : undefined,
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

/* ======================================================
   Scheduled Jobs
====================================================== */

export const scheduledFunction = onSchedule(
	{
		schedule: '0 9 * * 1-5',
		region: 'us-central1',
	},
	wrapWithSentry(async () => {
		if (isProd) {
			await dailyJobs();
		}
	}),
);

export const scheduledSaturdayFunction = onSchedule(
	{
		schedule: '0 1 * * 6',
		region: 'us-central1',
	},
	wrapWithSentry(async () => {
		if (isProd) {
			await dailyJobs();
		}
	}),
);

export const scheduledViolationsJob = onSchedule(
	{
		schedule: '0 16,17,18,19,20,21 * * 1-6',
		region: 'us-central1',
	},
	wrapWithSentry(async () => {
		if (isProd) {
			await violationsJob();
		}
	}),
);

/* ======================================================
   Non-sensitive Environment Debug Endpoint
====================================================== */

/**
 * Debug-only environment endpoint
 * 🚫 Disabled in production unless debug key is provided
 */
export const currentEnvironment = onRequest(
	{
		region: 'us-central1',
		secrets: ['MAS_DEBUG_KEY'],
	},
	async (request, response) => {
		try {
			// Protect this endpoint
			debugGuard(request as any, response as any, () => {
				// Only return very safe keys
				const safeKeys = ['GCLOUD_PROJECT', 'FUNCTIONS_EMULATOR', 'NODE_ENV', 'LOCATION'];

				const envVars: Record<string, string | undefined> = safeKeys.reduce(
					(acc, key) => {
						acc[key] = process.env[key];
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

/* ======================================================
   Twilio Firestore Trigger (Gen2 + Secrets)
====================================================== */

const twilioController = TwilioController.getInstance();

export const sendMessage = onDocumentCreated(
	{
		document: 'sms_messages/{messageId}',
		database: 'default', // ✅ ENTERPRISE DB TARGET
		region: 'us-central1',
		secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID],
	},
	async event => {
		if (!event.data) return;
		await twilioController.processFirestoreMessage(event.data.ref);
	},
);
