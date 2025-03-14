import { Request, Response } from 'express';
import moment from 'moment-timezone';
import { Attendance, AttendanceViolation, Program, Schedule } from '../interfaces';
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
		// Fetch program names
		const programs = await getProgramsWithReservations();
		const programNames = programs.map(program => program.name);

		const serverTimeInEventTZ = moment.tz('America/New_York');
		console.log('moment in New York time zone', serverTimeInEventTZ.format());

		const snapshot = await admin.firestore().collection('mas-schedules').where('end.dateTime', '<', serverTimeInEventTZ.format()).where('eventType', '==', 'default').get();

		// If no documents exist, return a response
		if (snapshot.empty) {
			return response.status(200).json({ message: 'No schedules to update.' });
		}

		const documentsToUpdate: Schedule[] = [];
		const documentsToReturn: Schedule[] = [];
		const violations: Attendance[] = [];

		// Process each schedule
		for (const doc of snapshot.docs) {
			const schedule = doc.data() as Schedule;
			console.log(schedule);

			// If summary is not in programNames OR event time has already passed, mark for closing
			if (!programNames.includes(schedule.summary)) {
				schedule.eventType = 'closed';
				documentsToUpdate.push({ ...schedule });
			} else {
				documentsToReturn.push({ ...schedule });
			}
		}

		// Process unattended reservations after all documents are added
		const vData = await processUnattendedReservations(documentsToReturn);
		violations.push(...vData);

		// Update Firestore for documents that need to be closed
		if (documentsToUpdate.length > 0) {
			await updateSchedulesInFirestore(documentsToReturn);
		}

		// **Ensure function always returns a response**
		return response.status(200).json({ updated: documentsToUpdate.length, violations: violations });
	} catch (e: any) {
		const additionalInfo = {
			timestamp: new Date().toISOString(),
			originalError: e instanceof Error ? e.message : 'Unknown error',
		};
		const customError = new CustomError('Failed to getSchedulesNotClosed', 'controller=>sandbox=>getSchedulesNotClosed', additionalInfo);
		return handleError(customError, response);
	}
};

async function getProgramsWithReservations(): Promise<Program[]> {
	const snapshot = await admin.firestore().collection('mas-programs').where('optionReserve', '==', true).orderBy('name').get();

	return snapshot.docs.map(doc => doc.data()) as Program[];
}

async function processUnattendedReservations(documentsToReturn: Schedule[]): Promise<AttendanceViolation[]> {
	const unattendedViolations: AttendanceViolation[] = [];

	documentsToReturn.forEach(schedule => {
		if (!schedule.attendance || schedule.attendance.length === 0) {
			return; // Skip schedules with no attendance
		}

		const unattendedAttendees = schedule.attendance.filter(attendee => attendee.reserved === true && attendee.attended === false);

		unattendedAttendees.forEach(attendee => {
			unattendedViolations.push({
				action: undefined, // Can be set later to 'waive' or 'fee'
				attended: attendee.attended,
				cycleName: schedule.cycleName || 'Unknown Cycle',
				endDate: schedule.end.dateTime,
				id: attendee.id,
				name: attendee.name,
				notifications: attendee.notifications,
				reserved: attendee.reserved,
				scheduleId: schedule.id,
				summary: schedule.summary,
			});
		});
	});

	return unattendedViolations;
}

async function updateSchedulesInFirestore(documents: Schedule[]) {
	const batch = admin.firestore().batch();
	const scheduleRef = admin.firestore().collection('mas-schedules');

	for (const doc of documents) {
		const docRef = scheduleRef.doc(doc.id);
		batch.update(docRef, { eventType: 'closed' });
	}

	await batch.commit();
}

/*
async function setAccountViolation(id: string, payload: any): Promise<void> {
	const = admin.firestore().doc(`mas-accounts/${id}/mas-accounts-violation`, payload.scheduleId);

	const ref = doc(this.firestore, `mas-accounts/${id}/mas-accounts-violation`, payload.scheduleId);
	return await setDoc(ref, payload, { merge: true });
}



! get schedules not closed



write email to mas-email
	async setAccountViolation(id: string, payload: any): Promise<void> {
		if (window.location.hostname == 'localhost') console.log('setAccountViolation=>payload', payload);

		const ref = doc(this.firestore, `mas-accounts/${id}/mas-accounts-violation`, payload.scheduleId);
		return await setDoc(ref, payload, { merge: true });
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
