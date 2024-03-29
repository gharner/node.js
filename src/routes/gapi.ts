import { Router } from 'express';
import { accessToken, addMember, directory, events, googleLogin, group, members, oAuthCallback, removeMember } from '../controller';
import { IRoutes } from '../interfaces';

const router = Router();

router.get('/accessToken', accessToken);
router.get('/addMember', addMember);
router.get('/directory', directory);
router.get('/events', events);
router.get('/googleLogin', googleLogin);
router.get('/group', group);
router.get('/members', members);
router.get('/oAuthCallback', oAuthCallback);
router.get('/removeMember', removeMember);

export const gapi: IRoutes = {
	name: 'gapi',
	router,
};
