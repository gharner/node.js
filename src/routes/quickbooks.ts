import { Router } from 'express';
import { auth_token, get_updates, refresh_token, getCustomerByEmail } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();
const routesInfo: { method: string; path: string }[] = [];

const addRoute = (method: string, path: string, handler: Function) => {
	routesInfo.push({ method, path });
};

addRoute('get', '/auth_token', auth_token);
addRoute('get', '/get_updates', get_updates);
addRoute('get', '/refresh_token', refresh_token);
addRoute('get', '/getCustomerByEmail', getCustomerByEmail);

export const qb: IRoutes = {
	name: 'qb',
	router,
	routesInfo,
};
