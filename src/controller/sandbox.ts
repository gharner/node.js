import { Request, Response } from 'express';
import * as functions from 'firebase-functions/v1';
import { admin } from '../middleware/firebase';
import { CustomError, handleError } from '../utilities/common';

const logger = functions.logger;
//const firestore = functions.firestore;

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
			const additionalInfo = {
				timestamp: new Date().toISOString(),
				originalError: e instanceof Error ? e.message : 'Unknown error',
			};

			logger.error('Error in space_station:', additionalInfo);

			const customError = new CustomError('Failed to space_station', 'controller=>sandbox=>space_station', additionalInfo);
			handleError(customError, response);
		});
};
export const getFirecloudDocuments = async (request: Request, response: Response) => {
	try {
		const querySnapshot = await admin.firestore().collection('mas-parameters').get();
		const documents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

		response.status(200).send(documents);
	} catch (e: any) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in getFirecloudDocuments:', additionalInfo);

		const customError = new CustomError('Failed to getFirecloudDocuments', 'controller=>sandbox=>getFirecloudDocuments', additionalInfo);
		handleError(customError, response);
	}
};

/* export const onAddSandboxDocument = firestore.document('sandbox-documents/{docId}').onCreate(async (snap, context) => {
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
}); */

export const htmlExample = (request: Request, response: Response) => {
	response.render('index', { title: 'Home Page' });
};

export const testErrorHandler = (request: Request, response: Response) => {
	try {
		throw new CustomError('Something went wrong', 'Some custom value', { additional: 'info' });
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};
		const customError = new CustomError('Failed sendNotification', 'controller=>sandbox=>testErrorHandler', additionalInfo);
		handleError(customError, response);
	}
};
