import { Request, Response } from 'express';
import axios from 'axios';

export const getHTML = async (request: Request, response: Response): Promise<void> => {
	const url = request.query.url as string;

	if (!url) {
		response.status(400).send('URL parameter is required.');
		return;
	}

	try {
		const result: any = await axios.get(url).catch(error => {
			response.status(500).send({ axiosError: { error } });
		});

		const contentType = result.headers['content-type'];

		if (!contentType || !contentType.includes('text/html')) {
			response.status(415).send('URL did not return HTML content.');
			return;
		}

		response.send(result.data);
	} catch (error: any) {
		if (error) {
			response.status(500).send(error);
		} else {
			response.status(500).send(`Internal Server Error with ${url}.`);
		}
	}
};
