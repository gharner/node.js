import { Request, Response } from 'express';

/* export const list_routes = async (request: Request, response: Response): Promise<void> => {
	const { route } = request.params;

	let payload = route ? routeList.filter(f => f.route === route) : routeList;

	const data = JSON.stringify(payload);
	response.send(data);

	//response.render('index', { routes: payload });
}; */

export const space_station = (request: Request, response: Response) => {
	const axios = require('axios');

	const url = 'http://api.open-notify.org/iss-now.json';

	const config = {
		method: 'get',
		url: url,
	};

	axios(config)
		.then((result: any) => {
			const data = JSON.stringify(result.data);
			response.send(data);
		})
		.catch((error: any) => {
			response.send(error);
		});
};
