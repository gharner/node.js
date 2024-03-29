import Express from 'express';
import { IRoutes } from './interfaces';
import { cors } from './middleware/cors';
import { routes } from './routes';
import { dailyJobs } from './controller/gizmo';
import * as functions from 'firebase-functions';
import { admin } from './middleware/firebase';

// REST API routes
routes.forEach((routerObj: IRoutes) => {
	const app = Express();

	// add cors middleware
	app.use(cors);

	// export routes individually for cloud functions
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

export const currentEnvironment = functions.https.onRequest((request, response) => {
	const keysOfInterest = ['REDIRECT_URI', 'NODE_ENV', 'PWD', 'HOME', 'FIREBASE_CONFIG', 'GCLOUD_PROJECT'];

	let envVars = keysOfInterest.reduce<{ [key: string]: string | undefined }>((acc, key) => {
		if (process.env[key] !== undefined) {
			acc[key] = process.env[key];
		}
		return acc;
	}, {});

	// Parse FIREBASE_CONFIG if it exists and is valid JSON, then merge it
	if (envVars.FIREBASE_CONFIG) {
		try {
			const firebaseConfig = JSON.parse(envVars.FIREBASE_CONFIG);
			// Remove the stringified FIREBASE_CONFIG to avoid redundancy
			delete envVars.FIREBASE_CONFIG;
			envVars = { ...envVars, ...firebaseConfig };
		} catch (error) {
			console.error('Error parsing FIREBASE_CONFIG:', error);
		}
	}

	response.json(envVars);
});
