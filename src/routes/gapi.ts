import { Router } from 'express';
import { accessToken, addMember, createSharedContact, directory, events, googleLogin, group, members, oAuthCallback, removeMember, removeSharedContact } from '../controllers/gapi.controller';

const router = Router();

router.get('/googleLogin', googleLogin);
router.get('/oAuthCallback', oAuthCallback);

router.get('/accessToken', accessToken);
router.get('/directory', directory);
router.get('/events', events);
router.get('/group', group);
router.get('/members', members);

router.post('/addMember', addMember);
router.post('/removeMember', removeMember);

router.post('/createSharedContact', createSharedContact);
router.post('/removeSharedContact', removeSharedContact);

export default router;
