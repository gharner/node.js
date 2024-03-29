import { Router } from 'express';
import { fulllist } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();

router.get('/', fulllist);

export const sharedContacts: IRoutes = {
	name: 'sharedContacts',
	router,
};
