export interface emailMessage {
	to: string;
	cc?: string;
	bcc?: string;
	message: { subject: string; text: string };
}
