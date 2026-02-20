import { Router } from 'express';
import { TwilioController } from '../controllers/twilio.controller';

const router = Router();
const controller = TwilioController.getInstance();

// Twilio Delivery Status Webhook
router.post('/v1/status', async (req, res) => {
	await controller.handleStatusWebhook(req, res);
});

router.post('/v1/inbound', async (req, res) => {
	await controller.handleInboundWebhook(req, res);
});

export default router;
