import gapi from './gapi';
import sandbox from './sandbox';
import twilioRouter from './twilio';

export const routes = [
	{
		name: 'twilio',
		router: twilioRouter,
	},
	{
		name: 'gapi',
		router: gapi,
	},
	{
		name: 'sandbox',
		router: sandbox,
	},
];
