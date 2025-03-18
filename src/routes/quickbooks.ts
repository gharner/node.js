import { Router } from 'express';
import { getQuickBooksAuthUrl, quickBooksCallback, refreshQuickBooksToken } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();

router.get('/getQuickBooksAuthUrl', getQuickBooksAuthUrl);
router.get('/quickBooksCallback', quickBooksCallback);
router.get('/refreshQuickBooksToken', refreshQuickBooksToken);
//router.get('/getCustomerByEmail', getCustomerByEmail);

export const qb: IRoutes = {
	name: 'qb',
	router,
};
