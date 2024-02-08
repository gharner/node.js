import { Router } from 'express';
import { fulllist } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();
const routesInfo: { method: string; path: string }[] = [];

const addRoute = (method: string, path: string, handler: Function) => {
	routesInfo.push({ method, path });
};

addRoute('get', '/', fulllist);

export const sharedContacts: IRoutes = {
	name: 'sharedContacts',
	router,
	routesInfo,
};
