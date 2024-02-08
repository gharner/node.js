import { Router } from 'express';

export interface IRoutes {
	name: string;
	router: Router;
	routesInfo?: { method: string; path: string }[];
}
