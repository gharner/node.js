import axios from 'axios';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v2';

import { CustomError, enterpriseDb } from '../modules';

/**
 * Fetches current International Space Station location
 */
export const space_station = async (request: Request, response: Response): Promise<void> => {
	try {
		const url = 'http://api.open-notify.org/iss-now.json';
		const result = await axios.get(url);

		response.status(200).send(result.data);
	} catch (e: any) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in space_station:', additionalInfo);

		response.status(500).send({
			error: 'Failed to fetch space station data',
			details: additionalInfo,
		});
	}
};

/**
 * Fetches Firestore documents from mas-parameters collection
 * ✅ ENTERPRISE DATABASE
 */
export const getFirecloudDocuments = async (request: Request, response: Response): Promise<void> => {
	try {
		// ✅ Enterprise Firestore Query
		const querySnapshot = await enterpriseDb.collection('mas-parameters').get();

		const documents = querySnapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data(),
		}));

		response.status(200).send(documents);
	} catch (e: any) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in getFirecloudDocuments:', additionalInfo);

		response.status(500).send({
			error: 'Failed to fetch Firestore documents',
			details: additionalInfo,
		});
	}
};

/**
 * Renders HTML example page
 */
export const htmlExample = (request: Request, response: Response): void => {
	try {
		response.render('index', { title: 'Home Page' });
	} catch (e: any) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in htmlExample:', additionalInfo);

		response.status(500).send({
			error: 'Failed to render HTML page',
			details: additionalInfo,
		});
	}
};

/**
 * Test error handler endpoint
 */
export const testErrorHandler = (request: Request, response: Response): void => {
	try {
		throw new CustomError('Something went wrong', 'Some custom value', {
			additional: 'info',
		});
	} catch (e: any) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		logger.error('Error in testErrorHandler:', additionalInfo);

		response.status(500).send({
			error: 'Test error handler triggered',
			details: additionalInfo,
		});
	}
};
