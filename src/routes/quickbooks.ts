import { Router } from 'express';
import { auth_token, get_updates, refresh_token, getCustomerByEmail, auth_request } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();

router.get('/auth_token', auth_token);
router.get('/get_updates', get_updates);
router.get('/refresh_token', refresh_token);
router.get('/getCustomerByEmail', getCustomerByEmail);
router.get('/auth_request', auth_request);

export const qb: IRoutes = {
	name: 'qb',
	router,
};
