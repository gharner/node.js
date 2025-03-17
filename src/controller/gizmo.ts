import * as Sentry from '@sentry/google-cloud-serverless';
import { Schedule } from '../interfaces';
import { EmailMessage } from '../interfaces/common';
import { admin } from '../middleware/firebase';

// Initialize Sentry
Sentry.init({
	dsn: 'https://3bc129af82c1d7ef8f769984a04535df@o4508904065204224.ingest.us.sentry.io/4508989823451136',
	tracesSampleRate: 1.0,
});

/**
 * Runs scheduled jobs daily.
 * This function fetches schedules from Firestore and processes them.
 */
export const dailyJobs = async () => {
	try {
		await getSchedules();
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error in dailyJobs:', error);
	}
};

/**
 * Fetch schedules for the current day from Firestore.
 */
async function getSchedules() {
	const today = new Date();
	today.setHours(today.getHours() - 4);

	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);

	const from = today.toISOString().slice(0, 10);
	const to = tomorrow.toISOString().slice(0, 10);

	if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
		console.log('getSchedules=>Query Params', { from, to });
	}

	try {
		const snapshot = await admin.firestore().collection('mas-schedules').where('start.dateTime', '>', from).where('start.dateTime', '<', to).get();

		if (snapshot.empty) {
			console.warn('getSchedules=>No schedules found for today.');
			return;
		}

		const data = snapshot.docs.map(doc => doc.data()) as Schedule[];
		await processSchedules(data);
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error in getSchedules:', error);
	}
}

/**
 * Process the retrieved schedules.
 */
async function processSchedules(schedules: Schedule[]) {
	for (const schedule of schedules) {
		const notificationArray = schedule.attendance?.flatMap(m => m.notifications || []) ?? [];

		if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
			console.log('processSchedules=>Raw Notifications', notificationArray);
		}

		try {
			if (notificationArray.length === 0) {
				console.warn(`processSchedules=>No notifications found for schedule: ${schedule.summary}`);
				continue;
			}

			const uniqueNotifications = getUniqueNotifications(notificationArray);

			if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
				console.log('processSchedules=>Unique Notifications', uniqueNotifications);
			}

			const groupEmail = uniqueNotifications
				.map(n => n.email)
				.filter(email => email)
				.join(',');

			if (groupEmail) {
				await sendNotification('mas-email', 'accounts@yongsa.net', schedule, groupEmail);
			}

			for (const notify of uniqueNotifications.filter(n => n.phone)) {
				await sendNotification('mas-twilio', notify.phone, schedule, '');
			}
		} catch (error) {
			Sentry.captureException(error);
			console.error('Error in processSchedules:', error);
		}
	}
}

/**
 * Remove duplicate notifications based on email and phone.
 */
function getUniqueNotifications(notifications: any[]) {
	const uniqueMap = new Map();

	return notifications.filter(notification => {
		const key = `${notification.email || ''}-${notification.phone || ''}`;
		if (uniqueMap.has(key)) {
			return false;
		}
		uniqueMap.set(key, true);
		return true;
	});
}

/**
 * Send notifications via Firebase Firestore.
 */
async function sendNotification(collection: string, to: string, schedule: Schedule, cc?: string) {
	const startDate = dateLocalString(schedule.start.dateTime);
	let message: EmailMessage | { to: string; body: string };

	if (collection === 'mas-email') {
		message = {
			to,
			cc,
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

		if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
			console.log(`sendNotification=>Success [${collection}]`, message);
		}
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error in sendNotification:', error);
	}
}

/**
 * Convert a date to a local string format in New York timezone.
 */
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
