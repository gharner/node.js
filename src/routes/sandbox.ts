import { Router } from 'express';
import { getFirecloudDocuments, htmlExample, space_station, testErrorHandler } from '../controllers';
import { IRoutes } from '../interfaces';

const router = Router();

router.get('/v1/station', space_station);
router.get('/documents', getFirecloudDocuments);
router.get('/html', htmlExample);
router.get('/testErrorHandler', testErrorHandler);

export const sandbox: IRoutes = {
	name: 'sandbox',
	router,
};
