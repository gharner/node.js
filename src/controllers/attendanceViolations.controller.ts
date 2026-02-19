import { FieldValue } from '@google-cloud/firestore';
import * as Sentry from '@sentry/google-cloud-serverless';
import moment from 'moment-timezone';
import { AttendanceViolation, Program, Schedule } from '../interfaces';
import { enterpriseDb } from '../modules';

/* ============================================================
   Interfaces
============================================================ */

export interface EmailMessage {
	to: string[];
	cc?: string[];
	bcc?: string[];
	message: {
		subject: string;
		text?: string;
		html?: string;
	};
}

/* ============================================================
   Initialize Sentry
============================================================ */

Sentry.init({
	dsn: 'https://3bc129af82c1d7ef8f769984a04535df@o4508904065204224.ingest.us.sentry.io/4508989823451136',
	tracesSampleRate: 1.0,
});

/* ============================================================
   Public Job Entry
============================================================ */

export const violationsJob = async () => {
	try {
		await getSchedulesNotClosed();
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error in violationsJob:', error);
	}
};

/* ============================================================
   Step 1: Fetch Past Schedules that are Not Closed
============================================================ */

async function getSchedulesNotClosed() {
	try {
		const programs = await getProgramsWithReservations();
		const programNames = programs.map(program => program.name);

		const serverTimeInEventTZ = moment.tz('America/New_York');

		const snapshot = await enterpriseDb.collection('mas-schedules').where('end.dateTime', '<', serverTimeInEventTZ.format()).where('eventType', '==', 'default').get();

		if (snapshot.empty) return;

		const documentsToUpdate: Schedule[] = [];
		const documentsToReturn: Schedule[] = [];

		for (const doc of snapshot.docs) {
			const schedule = doc.data() as Schedule;

			if (!programNames.includes(schedule.summary)) {
				schedule.eventType = 'closed';
				documentsToUpdate.push(schedule);
			} else {
				documentsToReturn.push(schedule);
			}
		}

		if (documentsToUpdate.length > 0) {
			await closeReservationSchedules(documentsToUpdate);
		}

		const violations = await processUnattendedReservations(documentsToReturn);

		await updateAttendanceViolations(violations);
		await closeReservationSchedules(documentsToReturn);
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error in getSchedulesNotClosed:', error);
	}
}

/* ============================================================
   Step 1.1: Programs requiring reservations
============================================================ */

async function getProgramsWithReservations(): Promise<Program[]> {
	try {
		const snapshot = await enterpriseDb.collection('mas-programs').where('optionReserve', '==', true).orderBy('name').get();

		return snapshot.docs.map(doc => doc.data() as Program);
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error fetching programs:', error);
		return [];
	}
}

/* ============================================================
   Step 4: Extract Attendance Violations
============================================================ */

async function processUnattendedReservations(schedules: Schedule[]): Promise<AttendanceViolation[]> {
	const violations: AttendanceViolation[] = [];

	try {
		for (const schedule of schedules) {
			if (!schedule.attendance?.length) continue;

			const unattendedAttendees = schedule.attendance.filter(att => att.reserved === true && att.attended === false);

			for (const attendee of unattendedAttendees) {
				violations.push({
					action: undefined,
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
			}
		}
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error processing unattended reservations:', error);
	}

	return violations;
}

/* ============================================================
   Close Schedules
============================================================ */

async function closeReservationSchedules(schedules: Schedule[]) {
	if (!schedules.length) return;

	const batch = enterpriseDb.batch();

	try {
		for (const schedule of schedules) {
			const scheduleRef = enterpriseDb.collection('mas-schedules').doc(schedule.id);

			batch.update(scheduleRef, {
				eventType: 'closed',
				updatedAt: FieldValue.serverTimestamp(),
			});
		}

		await batch.commit();
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error closing schedules:', error);
	}
}

/* ============================================================
   Step 5: Update Violations
============================================================ */

async function updateAttendanceViolations(violations: AttendanceViolation[]) {
	if (!violations.length) return;

	const batch = enterpriseDb.batch();

	try {
		for (const violation of violations) {
			const violationRef = enterpriseDb.collection(`mas-accounts/${violation.id}/mas-accounts-violation`).doc(violation.scheduleId);

			batch.set(
				violationRef,
				{
					eventType: 'closed',
					attended: violation.attended,
					cycleName: violation.cycleName,
					endDate: violation.endDate,
					name: violation.name,
					notifications: violation.notifications,
					reserved: violation.reserved,
					summary: violation.summary,
					scheduleId: violation.scheduleId,
					action: violation.action ?? null,
					updatedAt: FieldValue.serverTimestamp(),
				},
				{ merge: true },
			);
		}

		await batch.commit();

		await Promise.all(violations.map(addViolationEmail));
	} catch (error) {
		Sentry.captureException(error);
		console.error('Error updating attendance violations:', error);
	}
}

/* ============================================================
   Step 5.1: Send Violation Email
============================================================ */

async function addViolationEmail(violation: AttendanceViolation) {
	try {
		const emailBody = `${violation.name} was scheduled to attend a ${violation.summary} class on ${violation.endDate} but did not show.`;

		const email: EmailMessage = {
			to: ['gh@yongsa.net', 'rachel.harner@yongsa.net', 'tara.harner@yongsa.net'],
			message: {
				subject: 'Attendance Violation',
				text: emailBody,
			},
		};

		await enterpriseDb.collection('mas-email').add(email);
	} catch (error) {
		Sentry.captureException(error);
		console.error(`Error sending violation email for ${violation.name}:`, error);
	}
}
