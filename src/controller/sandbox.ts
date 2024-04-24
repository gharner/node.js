import { Request, Response } from 'express';
import { logger } from 'firebase-functions';
import { admin } from '../middleware/firebase';
import * as functions from 'firebase-functions';

export const space_station = (request: Request, response: Response) => {
	const axios = require('axios');

	const url = 'http://api.open-notify.org/iss-now.json';

	const config = {
		method: 'get',
		url: url,
	};

	axios(config)
		.then((result: any) => {
			const data = JSON.stringify(result.data);
			response.send(data);
		})
		.catch((error: any) => {
			response.send(error);
		});
};

export const getFirecloudDocuments = async (request: Request, response: Response) => {
	try {
		logger.log(`request=${request}`);

		const documents = admin.firestore().collection('mas-parameters').get();

		response.status(200).send(documents);
	} catch (error: any) {
		response.status(400).send(error);
	}
};

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
