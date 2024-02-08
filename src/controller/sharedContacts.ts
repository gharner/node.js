import https from 'https';
import { Request, Response } from 'express';

export const fulllist = (request: Request, response: Response) => {
	const options = {
		host: 'www.google.com',
		path: '/m8/feeds/contacts/yongsa.net/full?max-results=5000',
		headers: {
			Authorization: `OAuth ${request.headers.token}`,
			responseType: 'application/atom+xml',
			'GData-Version': '3.0',
		},
	};

	const callback = (result: any) => {
		let str = '';

		//another chunk of data has been received, so append it to `str`
		result.on('data', (chunk: any) => {
			str += chunk;
		});

		//the whole response has been received, so we just print it out here
		result.on('end', () => {
			response.send(str);
		});
	};

	https.request(options, callback).end();
};
