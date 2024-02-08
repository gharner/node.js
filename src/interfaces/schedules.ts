export interface Schedule {
	attendance?: Attendance[];
	cycleName: string;
	end: { dateTime: string; timeZone: string };
	id: string;
	notifications?: Notifications[];
	start: { dateTime: string; timeZone: string };
	summary: string;
}

export interface Attendance {
	attendanceTotal?: number;
	attended: boolean;
	id: string;
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
