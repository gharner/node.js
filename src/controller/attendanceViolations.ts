import { Request, Response } from 'express';
import { Program, Schedule } from '../interfaces';
import { admin } from '../middleware/firebase';
import { CustomError, handleError } from '../utilities/common';

/* export const fetchViolations = async () => {
	await getSchedulesNotClosed().catch(e => {
		// Capture additional information
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		// Throw the CustomError with additional information
		const customError = new CustomError('Failed dailyJobs', 'controller=>gizmo=>dailyJobs', additionalInfo);
		handleError(customError);
	});
}; */

export const getSchedulesNotClosed = async (request: Request, response: Response) => {
	try {
		const programs = await getProgramsWithReservations();
		const snapshot = await admin.firestore().collection('mas-schedules').where('eventType', '==', 'default').get();
		const documents = snapshot.docs.map(doc => doc.data()) as Schedule[];

		response.status(200).send({ documents: documents, programs: programs });
	} catch (e: any) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};
		const customError = new CustomError('Failed to getFirecloudDocuments', 'controller=>sandbox=>getFirecloudDocuments', additionalInfo);
		handleError(customError, response);
	}
};

async function getProgramsWithReservations() {
	const snapshot = await admin.firestore().collection('mas-programs').where('optionReserve', '==', true).orderBy('name').get();
	return snapshot.docs.map(doc => doc.data()) as Program[];
}

/*


! get schedules not closed

check if summery is in list of programs requiring a reservation
	if no: close schedule
	if yes: extract attendance where reserved is true and attended is false.

update the account violations collection

export interface AttendanceViolation {
	action?: 'waive' | 'fee';
	attended: boolean;
	cycleName: string;
	endDate: string;
	id: string;
	name: string
	notifications: Notifications;
	reserved: boolean;
	scheduleId: string;
	summary: string;
}

write email to mas-email


	async deleteAccountViolation(memberId: string, documentId: string): Promise<void> {
		const ref = doc(this.firestore, `mas-accounts/${memberId}/mas-accounts-violation`, documentId);
		return await deleteDoc(ref).then(doc => doc);
	}


	async setAccountViolation(id: string, payload: any): Promise<void> {
		if (window.location.hostname == 'localhost') console.log('setAccountViolation=>payload', payload);

		const ref = doc(this.firestore, `mas-accounts/${id}/mas-accounts-violation`, payload.scheduleId);
		return await setDoc(ref, payload, { merge: true });
	}

async function getSchedulesNotClosed() {

}
		async function processSchedules(schedules: Schedule[]) {
	for (const schedule of schedules) {
		const notificationArray =
			schedule.attendance
				?.map(m => {
					if (m.notifications) {
						return m.notifications;
					}
					return null; // Return null instead of undefined
				})
				.filter(n => n !== null) ?? []; // Filter out null values

		try {
			if (notificationArray.length === 0) {
				continue;
			}

			const uniqueNotifications = getUniqueNotifications(notificationArray);

			// Log the uniqueNotifications array for debugging
			console.log('Unique Notifications:', uniqueNotifications);

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
		} catch (e) {
			// Capture additional information
			const additionalInfo = {
				timestamp: new Date().toISOString(),
				originalError: e instanceof Error ? e.message : 'Unknown error',
			};

			// Throw the CustomError with additional information
			const customError = new CustomError('Failed processSchedules', 'controller=>gizmo=>processSchedules', additionalInfo);
			handleError(customError);
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

async function sendNotification(collection: string, to: string, bcc: string, schedule: Schedule) {
	const startDate = dateLocalString(schedule.start.dateTime);
	let message: EmailMessage | { to: string; body: string };

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
	} catch (e) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};

		const customError = new CustomError('Failed sendNotification', 'controller=>gizmo=>sendNotification', additionalInfo);
		handleError(customError);
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

private async attendanceViolation() {
	if (window.location.hostname === 'localhost') return;

	try {
		const currentTime = this.getCurrentISOTimeString();
		const programs = await this.programsService.getProgramsWithReservations();
		const schedules = await this.schedulesService.getSchedulesNotClosed(
			currentTime,
			programs.map(p => p.name)
		);
		const attendanceDetails = this.extractAttendanceDetails(schedules);

		await Promise.all(attendanceDetails.map(detail => this.processAttendanceDetail(detail)));
	} catch (error) {
		this.logError('attendanceViolation', error);
	}
}

private extractAttendanceDetails(schedules: Schedule[]) {
	return schedules.flatMap(schedule => {
		schedule.eventType = 'closed';
		this.schedulesService.setScheduleById(schedule.id, schedule);

		return (
			schedule.attendance
				?.map(att => ({
					...att,
					scheduleId: schedule.id,
					endDate: schedule.end.dateTime,
					cycleName: schedule.cycleName,
					summary: schedule.summary,
					attended: att.attended !== att.reserved,
				}))
				.filter(att => att?.attended) || []
		);
	});
}
	private composeEmailMessage(detail: any, email: string, violationCount: number) {
		return {
			sender: 'gh@yongsa.net',
			to: 'gh@yongsa.net, tara.harner@yongsa.net, rachel.harner@yongsa.net',
			subject: 'Attendance Violation',
			text: `Name: ${detail.name}\nEmail: ${email}\nCycle: ${detail.cycleName}\nClass: ${detail.summary}\nScheduleId: ${detail.scheduleId}\nEnd Time: ${detail.endDate}\nTotal Violations: ${violationCount}`,
		};
	}

		private async processAttendanceDetail(detail: any) {
		try {
			await this.accountsService.setAccountViolation(detail.id, detail);
			const violations = await this.accountsService.getAccountViolations(detail.id, detail.cycleName);
			const email = await this.determineEmailForDetail(detail);
			const emailMessage = this.composeEmailMessage(detail, email, violations.length);

			// Here, you might still need to use Firebase to send emails, but errors are reported via Sentry.
			this.sendEmail(emailMessage);

			if (email === 'error') {
				Sentry.captureMessage('Attendance violation missing notification data', { extra: detail });
			}
		} catch (error) {
			this.logError('processAttendanceDetail', error);
		}
	}


	private async determineEmailForDetail(detail: any) {
		try {
			let account;
			if (detail.notifications?.id) {
				account = await this.accountsService.getAccountById(detail.notifications.id);
			} else {
				const accounts = await this.accountsService.getAccountsByLinkedProperties({ accountId: detail.id, person: detail.name, type: 'child' });
				account = accounts.pop() || (await this.accountsService.getAccountById(detail.id));
			}
			return account?.emailAddresses?.value || 'error';
		} catch (error) {
			this.logError('determineEmailForDetail', error);
			return 'error';
		}
	}

*/
