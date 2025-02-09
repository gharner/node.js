import Express from 'express';
import * as functions from 'firebase-functions/v1';
import { dailyJobs } from './controller/gizmo';
import { IRoutes } from './interfaces';
import { cors } from './middleware/cors';
import { routes } from './routes';
//import { onAddSandboxDocument } from './controller/sandbox';
import path from 'path';

routes.forEach((routerObj: IRoutes) => {
	const app = Express();
	app.use(cors);
	app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'ejs');
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

//export { onAddSandboxDocument };

/* const mainapp = Express();

// Set the view engine to EJS
mainapp.set('view engine', 'ejs');
mainapp.set('views', path.join(__dirname, 'views'));

// Define a route that renders an HTML page using EJS
mainapp.get('/example', (req, res) => {
	res.render('index', { title: 'Home Page' });
});

// Export the Express app as a Firebase Function
exports.mainapp = functions.https.onRequest(mainapp);
 */
