import { EmailMessage, Schedule } from '../interfaces';
import { CustomError, enterpriseDb } from '../modules';

export const dailyJobs = async () => {
	await getSchedules().catch(e => {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};
		throw new CustomError('Failed dailyJobs', 'controller=>gizmo=>dailyJobs', additionalInfo);
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
		// ✅ ENTERPRISE DATABASE QUERY
		const snapshot = await enterpriseDb.collection('mas-schedules').where('start.dateTime', '>', from).where('start.dateTime', '<', to).get();

		const data = snapshot.docs.map(doc => doc.data()) as Schedule[];
		await processSchedules(data);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		throw new CustomError('Failed getSchedules', 'controller=>gizmo=>getSchedules', additionalInfo);
	}
}

async function processSchedules(schedules: Schedule[]) {
	for (const schedule of schedules) {
		const notificationArray = schedule.attendance?.map(m => m.notifications ?? null).filter(n => n !== null) ?? [];

		try {
			if (notificationArray.length === 0) continue;

			const uniqueNotifications = getUniqueNotifications(notificationArray);

			console.log('Unique Notifications:', uniqueNotifications);

			const groupEmail = uniqueNotifications
				.map((m: { email: string }) => m.email)
				.filter((email: string) => email)
				.join();

			// ✅ Email Notification
			if (groupEmail) {
				await sendNotification('mas-email', 'accounts@yongsa.net', groupEmail, '', schedule);
			}

			// ✅ Twilio Notifications
			for (const notify of uniqueNotifications.filter((f: { phone: string }) => f.phone)) {
				await sendNotification('mas-twilio', notify.phone, '', '', schedule);
			}
		} catch (e) {
			const additionalInfo = {
				timestamp: new Date().toISOString(),
				originalError: e instanceof Error ? e.message : 'Unknown error',
			};

			throw new CustomError('Failed processSchedules', 'controller=>gizmo=>processSchedules', additionalInfo);
		}
	}
}

function getUniqueNotifications(notifications: any[]) {
	const uniqueSet = new Set();

	return notifications.filter((notification: { email?: string; phone?: string }) => {
		const identifier = `${notification.email || ''}-${notification.phone || ''}`;
		const duplicate = uniqueSet.has(identifier);

		uniqueSet.add(identifier);
		return !duplicate;
	});
}

async function sendNotification(collection: string, to: string, bcc: string | string[], cc: string | string[], schedule: Schedule) {
	const startDate = dateLocalString(schedule.start.dateTime);

	let message: EmailMessage | { to: string; body: string };

	const normalizeEmailField = (input: string | string[] | undefined): string[] | undefined => {
		if (!input) return undefined;
		if (Array.isArray(input)) return input;

		return input
			.split(',')
			.map(s => s.trim())
			.filter(Boolean);
	};

	// ✅ Email Doc
	if (collection === 'mas-email') {
		message = {
			to: [to],
			bcc: normalizeEmailField(bcc),
			cc: normalizeEmailField(cc),
			message: {
				subject: `${schedule.summary} class reservation reminder`,
				text: `You have a reservation for the ${schedule.summary} class at ${startDate}.`,
			},
		};
	}

	// ✅ SMS Doc
	else {
		message = {
			to: `+1${to}`,
			body: `You have a reservation for the ${schedule.summary} class at ${startDate}`,
		};
	}

	try {
		// ✅ ENTERPRISE DATABASE WRITE
		await enterpriseDb.collection(collection).add(message);
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		throw new CustomError('Failed sendNotification', 'controller=>gizmo=>sendNotification', additionalInfo);
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

	return d.toLocaleString('en-US', {
		timeZone: 'America/New_York',
	});
}
