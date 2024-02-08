export interface qbToken {
	access_token: string;
	expires_in: number;
	expires_time?: number;
	lastCustomerUpdate: number;
	refresh_time?: number;
	refresh_token: string;
	server_time: number;
	token_type: string;
	x_refresh_token_expires_in: number;
}
