import { Router } from 'express';
import { getSchedulesNotClosed } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();

router.get('/v1/schedulesNotClosed', getSchedulesNotClosed);

export const violations: IRoutes = {
	name: 'violations',
	router,
};
