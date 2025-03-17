import * as Sentry from '@sentry/google-cloud-serverless';
import { Request, Response } from 'express';
import * as functions from 'firebase-functions/v1';
import { admin } from '../middleware/firebase';

const logger = functions.logger;

// Initialize Sentry
Sentry.init({
	dsn: 'https://3bc129af82c1d7ef8f769984a04535df@o4508904065204224.ingest.us.sentry.io/4508989823451136',
	tracesSampleRate: 1.0,
});

/**
 * Fetches the current location of the International Space Station.
 */
export const space_station = async (request: Request, response: Response) => {
	try {
		const axios = require('axios');
		const url = 'http://api.open-notify.org/iss-now.json';

		const result = await axios.get(url);
		response.send(result.data);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in space_station:', error);
		response.status(500).send({ error: 'Failed to retrieve space station data.' });
	}
};

/**
 * Fetches all documents from the 'mas-parameters' collection in Firestore.
 */
export const getFirecloudDocuments = async (request: Request, response: Response) => {
	try {
		const querySnapshot = await admin.firestore().collection('mas-parameters').get();
		const documents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

		response.status(200).send(documents);
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in getFirecloudDocuments:', error);
		response.status(500).send({ error: 'Failed to retrieve Firestore documents.' });
	}
};

/**
 * Renders an example HTML page using EJS.
 */
export const htmlExample = (request: Request, response: Response) => {
	response.render('index', { title: 'Home Page' });
};

/**
 * Simulates an error to test Sentry error handling.
 */
export const testErrorHandler = (request: Request, response: Response) => {
	try {
		throw new Error('Something went wrong');
	} catch (error) {
		Sentry.captureException(error);
		logger.error('Error in testErrorHandler:', error);
		response.status(500).send({ error: 'An error occurred.' });
	}
};
