import Express from 'express';
import * as functions from 'firebase-functions';
import { dailyJobs } from './controller/gizmo';
import { IRoutes } from './interfaces';
import { cors } from './middleware/cors';
import { routes } from './routes';

routes.forEach((routerObj: IRoutes) => {
	const app = Express();
	app.use(cors);
	app.use(routerObj.router);
	exports[routerObj.name] = functions.https.onRequest(app);
});

export const scheduledFunction = functions.pubsub.schedule('0 9 * * 1-5').onRun(() => {
	if (process.env.GCLOUD_PROJECT === 'valiant-splicer-224515') {
		dailyJobs();
	}
});

export const scheduledSaturdayFunction = functions.pubsub.schedule('0 1 * * 6').onRun(() => {
	if (process.env.GCLOUD_PROJECT === 'valiant-splicer-224515') {
		dailyJobs();
	}
});

export const currentEnvironment = functions.https.onRequest((request, response) => {
	cors(request, response, () => {
		const keysToExclude: string[] = ['CLIENT_SECRET', 'DATABASE_PASSWORD', 'API_KEY', 'CLIENT_ID'];

		let envVars: { [key: string]: string | undefined } = Object.keys(process.env).reduce<{ [key: string]: string | undefined }>((acc, key) => {
			if (!keysToExclude.includes(key)) {
				acc[key] = process.env[key];
			}
			return acc;
		}, {});

		response.json(envVars);
	});
});
