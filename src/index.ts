import Express from 'express';
import { IRoutes } from './interfaces';
import { cors } from './middleware/cors';
import { routes } from './routes';
import { dailyJobs } from './controller/gizmo';
import * as functions from 'firebase-functions';
import { admin } from './middleware/firebase';
import * as path from 'path';

const app = Express();
app.use(cors);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

const allRoutesDetails: any[] = [];

// REST API routes
routes.forEach((routerObj: IRoutes) => {
	// export routes individually for cloud functions
	app.use(routerObj.router);
	exports[routerObj.name] = functions.https.onRequest(app);

	// add the routes info to the array
	if (routerObj.routesInfo) {
		const routesWithBasePath = routerObj.routesInfo.map(route => ({ ...route, path: `/${routerObj.name}${route.path}`, route: routerObj.name }));

		allRoutesDetails.push(...routesWithBasePath);
	}
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

export const onAddSandboxDocument = functions.firestore.document('sandbox-documents/{docId}').onCreate(async (snap, context) => {
	functions.logger.debug(`Running add document course trigger for document ${context.params.docId}`);

	const db = admin.firestore();
	const sandboxDoc = snap.data();

	functions.logger.debug(sandboxDoc);

	db.runTransaction(async transaction => {
		const ref = db.doc('chat-roles/admin');
		const data = (await transaction.get(ref)).data() as any;
		data.value = { name: 'Greg' };

		functions.logger.debug(data);

		transaction.set(ref, data);
	});
});

export const routeList = allRoutesDetails;
