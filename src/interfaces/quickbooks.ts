export interface qbToken {
	access_token: string;
	createdAt?: number;
	expires_in: number;
	expires_time?: number;
	id_token?: string;
	lastCustomerUpdate?: number;
	realmId?: string;
	refresh_expires_time?: number;
	refresh_time?: number;
	refresh_token: string;
	server_time?: number;
	token_type?: string;
	x_refresh_token_expires_in: number;
}
