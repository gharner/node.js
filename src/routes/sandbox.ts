import { space_station, getFirecloudDocuments } from '../controller';
import { IRoutes } from '../interfaces';
import { Router } from 'express';

const router = Router();

router.get('/v1/station', space_station);
router.get('/documents', getFirecloudDocuments);

export const sandbox: IRoutes = {
	name: 'sandbox',
	router,
};
