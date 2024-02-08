import { Router } from 'express';
import { getHTML } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();
const routesInfo: { method: string; path: string }[] = [];

const addRoute = (method: string, path: string, handler: Function) => {
	routesInfo.push({ method, path });
};

addRoute('get', '/url', getHTML);

export const htmlScrape: IRoutes = {
	name: 'htmlScrape',
	router,
	routesInfo,
};
