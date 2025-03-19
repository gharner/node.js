import { Router } from 'express';
import { sendMail } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();

router.post('/', sendMail);

export const masEmail: IRoutes = {
	name: 'masEmail',
	router,
};
