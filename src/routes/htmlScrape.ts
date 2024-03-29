import { Router } from 'express';
import { getHTML } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();

router.get('/url', getHTML);

export const htmlScrape: IRoutes = {
	name: 'htmlScrape',
	router,
};
