import { Router } from 'express';
import { accessToken, addMember, createSharedContact, directory, events, googleLogin, group, members, oAuthCallback, removeMember, removeSharedContact } from '../controllers';
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
router.post('/createSharedContact', createSharedContact);
router.post('/removeSharedContact', removeSharedContact);
export const gapi: IRoutes = {
	name: 'gapi',
	router,
};
