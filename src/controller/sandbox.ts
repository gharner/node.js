import { Request, Response } from 'express';
import { logger } from 'firebase-functions';
import { admin } from '../middleware/firebase';
import * as functions from 'firebase-functions';
import { handleError } from '../utilities/common';

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
		.catch((e: any) => {
			handleError(e, 'controller=>sandbox=>getFirecloudDocuments', response);
		});
};
export const getFirecloudDocuments = async (request: Request, response: Response) => {
	try {
		const querySnapshot = await admin.firestore().collection('mas-parameters').get();
		const documents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

		response.status(200).send(documents);
	} catch (e: any) {
		handleError(e, 'controller=>sandbox=>getFirecloudDocuments', response);
	}
};

export const onAddSandboxDocument = functions.firestore.document('sandbox-documents/{docId}').onCreate(async (snap, context) => {
	logger.debug(`Running add document course trigger for document ${context.params.docId}`);

	const db = admin.firestore();
	const sandboxDoc = snap.data();

	logger.debug(sandboxDoc);

	db.runTransaction(async transaction => {
		const ref = db.doc('chat-roles/admin');
		const data = (await transaction.get(ref)).data() as any;
		data.value = { name: 'Greg' };

		logger.debug(data);

		transaction.set(ref, data);
	});
});

export const htmlExample = (request: Request, response: Response) => {
	response.render('index', { title: 'Home Page' });
};

export const testErrorHandler = (request: Request, response: Response) => {
	try {
		throw new Error('Test Error Handler');
	} catch (e) {
		functions.logger.log('Caught error:', e);
		functions.logger.log('Instance of Error:', e instanceof Error);
		functions.logger.log('Error stringified:', JSON.stringify(e));
		handleError(e, 'controller=>sandbox=>testErrorHandler', response);
	}
};
