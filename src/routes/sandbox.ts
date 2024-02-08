import { list_routes, space_station } from '../controller';
import { IRoutes } from '../interfaces';
import { Router, RequestHandler } from 'express';

interface RouteInfo {
	method: 'get' | 'post' | 'put' | 'delete'; // extend as needed
	path: string;
}

const router = Router();
const routesInfo: RouteInfo[] = [];

const addRoute = (router: Router, method: RouteInfo['method'], path: string, handler: RequestHandler) => {
	routesInfo.push({ method, path });

	if (method === 'get') {
		router.get(path, handler);
	} else if (method === 'post') {
		router.post(path, handler);
	}
};

addRoute(router, 'get', '/', list_routes);
addRoute(router, 'get', '/v1/station', space_station);
addRoute(router, 'get', '/:route', list_routes);

export const sandbox: IRoutes = {
	name: 'sandbox',
	router,
	routesInfo,
};
