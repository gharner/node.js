export interface Program {
	css?: string;
	googleGroupId?: string;
	googleGroupMembersCount: number;
	googleSharedContactId?: string;
	groupEmail: string;
	id: string;
	name: string;
	optionReserve: boolean;
	reserveLimit: number;
	testCategory?: string;
	memberships?: ProgramMember[];
}

export interface ProgramMember {
	billingId?: string;
	billingEmail?: string;
	memberId: string;
	memberName: string;
}
