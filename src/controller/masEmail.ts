import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { gregharner, taraharner } from '../middleware/gmail.json';

export const sendMail = (request: Request, response: Response) => {
	let transporter = nodemailer.createTransport({
		host: 'smtp.gmail.com',
		port: 465,
		secure: true,
		auth: {
			user: gregharner.email,
			pass: gregharner.password,
		},
	});

	if (request.body.sender === 'taraharner@yongsa.net') {
		transporter = nodemailer.createTransport({
			host: 'smtp.gmail.com',
			port: 465,
			secure: true,
			auth: {
				user: taraharner.email,
				pass: taraharner.password,
			},
		});
	}

	const mailOptions = {
		from: `Yongsa Martial Arts <${request.body.sender}>`,
		to: request.body.to,
		subject: request.body.subject,
		text: request.body.text,
		html: request.body.html,
	};

	transporter.sendMail(mailOptions, (error, info) => {
		if (error) {
			return response.send(error.message);
		}
		return response.send(info.messageId);
	});
};
