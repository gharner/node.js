import { Schedule } from '../interfaces';
import { admin } from '../middleware/firebase';
import { logger } from 'firebase-functions';

export const dailyJobs = async () => {
	await getSchedules().catch(error => {
		logger.error('Failed to get schedules: ', error);

		const message = {
			to: 'gh@yongsa.net',
			message: { subject: 'gizmo error', text: `function errored processing the schedules` },
		};

		sendErrorEmail(message);
	});
};

async function getSchedules() {
	const today = new Date();
	today.setHours(today.getHours() - 4);

	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);

	const from = today.toISOString().slice(0, 10);

	const to = tomorrow.toISOString().slice(0, 10);

	try {
		const snapshot = await admin.firestore().collection('mas-schedules').where('start.dateTime', '>', from).where('start.dateTime', '<', to).get();

		const data = snapshot.docs.map(doc => doc.data()) as Schedule[];

		processSchedules(data);
	} catch (error) {
		logger.error('Failed to fetch schedules: ', error);

		const message = {
			to: 'gh@yongsa.net',
			message: { subject: 'gizmo error', text: `function errored processing the schedules` },
		};

		sendErrorEmail(message);
	}
}

async function processSchedules(schedules: Schedule[]) {
	for (const schedule of schedules) {
		const notificationArray =
			schedule.attendance?.map(m => {
				if (m.notifications) {
					return m.notifications;
				}
				return;
			}) ?? [];

		try {
			if (notificationArray.length === 0) {
				continue;
			}

			const uniqueNotifications = getUniqueNotifications(notificationArray);

			const groupEmail = uniqueNotifications
				.map((m: { email: string }) => m.email)
				.filter((email: string) => email)
				.join();

			if (groupEmail) {
				await sendNotification('mas-email', 'accounts@yongsa.net', groupEmail, schedule);
			}

			for (const notify of uniqueNotifications.filter((f: { phone: string }) => f.phone)) {
				await sendNotification('mas-twilio', notify.phone, '', schedule);
			}
		} catch (error) {
			logger.error('Error processing schedule:', error);
		}
	}
}

function getUniqueNotifications(notifications: any[]) {
	const uniqueSet = new Set();
	return notifications.filter((notification: unknown) => {
		const duplicate = uniqueSet.has(notification);
		uniqueSet.add(notification);
		return !duplicate;
	});
}

async function sendNotification(collection: string, to: string | undefined, bcc: string, schedule: Schedule) {
	const startDate = dateLocalString(schedule.start.dateTime);
	let message = {};

	if (collection === 'mas-email') {
		message = {
			to: to,
			bcc: bcc,
			message: {
				subject: `${schedule.summary} class reservation reminder`,
				text: `You have a reservation for the ${schedule.summary} class at ${startDate}.`,
			},
		};
	} else {
		message = {
			to: `+1${to}`,
			body: `You have a reservation for the ${schedule.summary} class at ${startDate}`,
		};
	}

	try {
		await admin.firestore().collection(collection).add(message);
	} catch (error) {
		logger.error('Failed to send notification: ', error);

		message = {
			to: 'gh@yongsa.net',
			message: { subject: 'gizmo error', text: `function errored when trying to add the message to the collection.` },
		};

		sendErrorEmail(message);
	}
}

function dateLocalString(d: any) {
	if (typeof d === 'string') {
		try {
			d = new Date(d);
		} catch {
			throw new Error(`Cannot convert ${d} to a new date`);
		}
	}

	return d.toLocaleString('en-US', { timeZone: 'America/New_York' });
}

async function sendErrorEmail(message: {}) {
	try {
		await admin.firestore().collection('mas-email').add(message);
	} catch (error) {
		logger.error('Failed to send error email: ', error);
	}
}
