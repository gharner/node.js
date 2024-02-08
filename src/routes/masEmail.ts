import { Router } from 'express';
import { sendMail } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();
const routesInfo: { method: string; path: string }[] = [];

const addRoute = (method: string, path: string, handler: Function) => {
	routesInfo.push({ method, path });
};

addRoute('post', '/', sendMail);

export const masEmail: IRoutes = {
	name: 'masEmail',
	router,
	routesInfo,
};
