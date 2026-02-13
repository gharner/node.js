export interface Schedule {
	attendance?: Attendance[];
	cycleName: string;
	end: { dateTime: string; timeZone: string };
	id: string;
	notifications?: Notifications[];
	start: { dateTime: string; timeZone: string };
	summary: string;
	eventType: 'default' | 'closed';
}

export interface Attendance {
	attendanceTotal?: number;
	attended: boolean;
	id: string;
	scheduleId: string;
	name: string;
	notifications?: Notifications;
	reserved: boolean;
	tournaments?: string;
}

export interface Notifications {
	email?: string;
	id: string;
	name: string;
	phone: string | undefined;
}

export interface AttendanceViolation {
	action?: 'waive' | 'fee';
	attended: boolean;
	cycleName: string;
	endDate: string;
	id: string;
	name: string;
	notifications?: Notifications;
	reserved: boolean;
	scheduleId: string;
	summary: string;
}
