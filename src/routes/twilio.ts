import { Router } from 'express';
import { inboundSmsWebhook } from '../controllers';
import { IRoutes } from '../interfaces';

const router = Router();

// Twilio will POST form-urlencoded inbound messages here
router.post('/v1/twilio/inbound', inboundSmsWebhook);

export const twilio: IRoutes = {
  name: 'twilio',
  router,
};
