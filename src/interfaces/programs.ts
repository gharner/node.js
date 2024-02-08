export interface Program extends ProgramMemberships {
	css?: string;
	googleGroupId?: string;
	googleGroupMembersCount: string;
	googleSharedContactId?: string;
	groupEmail: string;
	id?: string;
	name: string;
	optionReserve: boolean;
	reserveLimit: number;
	testCategory?: string;
}

export interface ProgramMember {
	billingId: string;
	billingName: string;
	billingEmail: string;
	memberId: string;
	memberName: string;
}

export interface ProgramMemberships {
	memberships?: ProgramMember[];
}
