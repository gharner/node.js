import { space_station, getFirecloudDocuments, htmlExample, testErrorHandler } from '../controller';
import { IRoutes } from '../interfaces';
import { Router } from 'express';

const router = Router();

router.get('/v1/station', space_station);
router.get('/documents', getFirecloudDocuments);
router.get('/html', htmlExample);
router.get('/testErrorHandler', testErrorHandler);

export const sandbox: IRoutes = {
	name: 'sandbox',
	router,
};
