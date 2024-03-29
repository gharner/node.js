import { space_station } from '../controller';
import { IRoutes } from '../interfaces';
import { Router } from 'express';

const router = Router();

//router.get('/', list_routes);
router.get('/v1/station', space_station);
//router.get('/v1/:route', list_routes);

export const sandbox: IRoutes = {
	name: 'sandbox',
	router,
};
