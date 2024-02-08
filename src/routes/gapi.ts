import { Router } from 'express';
import { accessToken, addMember, directory, events, googleLogin, group, members, oAuthCallback, removeMember } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();
const routesInfo: { method: string; path: string }[] = [];

const addRoute = (method: string, path: string, handler: Function) => {
	routesInfo.push({ method, path });
};

addRoute('get', '/accessToken', accessToken);
addRoute('get', '/addMember', addMember);
addRoute('get', '/directory', directory);
addRoute('get', '/events', events);
addRoute('get', '/googleLogin', googleLogin);
addRoute('get', '/group', group);
addRoute('get', '/members', members);
addRoute('get', '/oAuthCallback', oAuthCallback);
addRoute('get', '/removeMember', removeMember);

export const gapi: IRoutes = {
	name: 'gapi',
	router,
	routesInfo,
};
