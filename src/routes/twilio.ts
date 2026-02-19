import { Router } from 'express';
import { TwilioController } from '../controllers/twilio.controller';

const router = Router();
const controller = TwilioController.getInstance();

// Twilio Delivery Status Webhook
router.post('/status', async (req, res) => {
	await controller.handleStatusWebhook(req, res);
});

export default router;
