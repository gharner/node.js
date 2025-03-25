import Cors from 'cors';

const options: Cors.CorsOptions = {
	methods: 'GET,OPTIONS,POST,DELETE,HEAD,PATCH',
	preflightContinue: false,
	origin: true,
};

export const cors = Cors(options);
