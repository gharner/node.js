export interface EmailMessage {
	to: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	message: { subject: string; text?: string; html?: string };
}
