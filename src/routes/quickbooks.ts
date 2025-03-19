import { Router } from 'express';
import { auth_request, auth_token, get_updates, getCustomerByEmail, refresh_token, validateToken } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();

router.get('/auth_request', auth_request);
router.get('/auth_token', auth_token);
router.get('/get_updates', get_updates);
router.get('/getCustomerByEmail', getCustomerByEmail);
router.get('/refresh_token', refresh_token);
router.post('/validateToken', validateToken);

export const qb: IRoutes = {
	name: 'qb',
	router,
};
