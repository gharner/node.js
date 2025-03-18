import * as Sentry from '@sentry/google-cloud-serverless';
import Express from 'express';
import * as functions from 'firebase-functions/v1';
import path from 'path';
import { violationsJob } from './controller/attendanceViolations';
import { dailyJobs } from './controller/gizmo';
import { IRoutes } from './interfaces';
import { cors } from './middleware/cors';
import { routes } from './routes';

// Initialize Sentry for error tracking
Sentry.init({
	dsn: 'https://3bc129af82c1d7ef8f769984a04535df@o4508904065204224.ingest.us.sentry.io/4508989823451136',
	release: `my-firebase-functions@${process.env.SENTRY_RELEASE || 'dev'}`,
	tracesSampleRate: 1.0,
});

/**
 * Wraps functions with Sentry error tracking.
 * This ensures that any uncaught errors are reported to Sentry.
 */
const wrapWithSentry = (fn: Function) => {
	return async (...args: any[]) => {
		try {
			return await fn(...args);
		} catch (error) {
			Sentry.captureException(error);
			throw error; // Re-throw to ensure Firebase logs the failure
		}
	};
};

/**
 * Iterates over route definitions and creates Firebase functions for each one.
 * Each function serves an Express app handling API requests.
 */
routes.forEach((routerObj: IRoutes) => {
	const app = Express();

	app.use(cors);
	app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'ejs');
	app.use(routerObj.router);

	// Handle errors and report them to Sentry
	exports[routerObj.name] = functions.https.onRequest(async (req, res) => {
		try {
			await new Promise((resolve, reject) => {
				app(req, res, err => (err ? reject(err) : resolve(null)));
			});
		} catch (error) {
			Sentry.captureException(error);
			res.status(500).send('Internal Server Error');
		}
	});
});

/**
 * Scheduled job that runs Monday to Friday at 9 AM.
 * This function calls `dailyJobs()` if the project environment is correct.
 */
export const scheduledFunction = functions.pubsub.schedule('0 9 * * 1-5').onRun(
	wrapWithSentry(async () => {
		if (process.env.GCLOUD_PROJECT === 'valiant-splicer-224515') {
			await dailyJobs();
		}
	})
);

/**
 * Scheduled job that runs every Saturday at 1 AM.
 * This function calls `dailyJobs()` if the project environment is correct.
 */
export const scheduledSaturdayFunction = functions.pubsub.schedule('0 1 * * 6').onRun(
	wrapWithSentry(async () => {
		if (process.env.GCLOUD_PROJECT === 'valiant-splicer-224515') {
			await dailyJobs();
		}
	})
);

export const scheduledViolationsJob = functions.pubsub.schedule('0 9 * * 1-7').onRun(
	wrapWithSentry(async () => {
		if (process.env.GCLOUD_PROJECT === 'valiant-splicer-224515') {
			await violationsJob();
		}
	})
);

/**
 * Firebase function that returns non-sensitive environment variables.
 * This allows the frontend to access selected environment variables without exposing sensitive data.
 */
export const currentEnvironment = functions.https.onRequest(async (request, response) => {
	try {
		cors(request, response, () => {
			// List of environment variables to exclude from the response
			const keysToExclude: string[] = ['CLIENT_SECRET', 'DATABASE_PASSWORD', 'API_KEY', 'CLIENT_ID'];

			// Filter environment variables, excluding sensitive keys
			let envVars: { [key: string]: string | undefined } = Object.keys(process.env).reduce<{ [key: string]: string | undefined }>((acc, key) => {
				if (!keysToExclude.includes(key)) {
					acc[key] = process.env[key];
				}
				return acc;
			}, {});

			response.json(envVars);
		});
	} catch (error) {
		Sentry.captureException(error);
		response.status(500).send('Internal Server Error');
	}
});

/* export const logEnv = functions.https.onRequest(async (req, res) => {
	functions.logger.info('NODE_ENV:', process.env.NODE_ENV);
	functions.logger.info('GCLOUD_PROJECT:', process.env.GCLOUD_PROJECT);
	functions.logger.info('Firebase Config:', process.env.FIREBASE_CONFIG);
	functions.logger.info('Loaded Environment Variables:', JSON.stringify(process.env, null, 2));
	res.send('Logged environment variables.');
});
 */
/**
 * Example Express app with EJS rendering.
 * This is commented out but can be enabled if needed for serving views.
 */
// const mainapp = Express();
// mainapp.set('view engine', 'ejs');
// mainapp.set('views', path.join(__dirname, 'views'));

// mainapp.get('/example', (req, res) => {
//   res.render('index', { title: 'Home Page' });
// });

// exports.mainapp = functions.https.onRequest(mainapp);
