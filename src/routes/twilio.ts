import { Router } from 'express';
import { inboundSmsWebhook, trackClick } from '../controllers';
import { IRoutes } from '../interfaces';

const router = Router();

// Twilio will POST form-urlencoded inbound messages here
router.post('/v1/twilio/inbound', inboundSmsWebhook);
router.get('/v1/twilio/track', trackClick);
router.get('/vote/track', trackClick);

export const twilio: IRoutes = {
	name: 'twilio',
	router,
};
