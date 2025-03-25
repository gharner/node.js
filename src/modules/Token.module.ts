export interface TokenParams {
	access_token?: string;
	createdAt?: number;
	expires_in?: number;
	expires_time?: number; // Add this
	refresh_expires_time?: number; // Add this
	id_token?: string;
	latency?: number;
	realmId?: string;
	refresh_token?: string;
	token_type?: string;
	x_refresh_token_expires_in?: number;
}

export interface TokenData {
	access_token: string;
	createdAt: number;
	expires_in: number;
	expires_time?: number; // Add this
	refresh_expires_time?: number; // Add this
	id_token: string;
	realmId: string;
	refresh_token: string;
	token_type: string;
	x_refresh_token_expires_in: number;
}

export default class Token {
	access_token: string;
	createdAt: number;
	expires_in: number;
	expires_time: number; // Add this
	refresh_expires_time: number; // Add this
	id_token: string;
	latency: number;
	realmId: string;
	refresh_token: string;
	token_type: string;
	x_refresh_token_expires_in: number;

	constructor(params: TokenParams = {}) {
		this.access_token = params.access_token || '';
		this.createdAt = params.createdAt || Date.now();
		this.expires_in = params.expires_in || 0;
		this.expires_time = params.expires_time || this.calculateExpiresTime(params.expires_in); // Add this
		this.refresh_expires_time = params.refresh_expires_time || this.calculateExpiresTime(params.x_refresh_token_expires_in); // Add this
		this.id_token = params.id_token || '';
		this.latency = params.latency || 60 * 1000;
		this.realmId = params.realmId || '';
		this.refresh_token = params.refresh_token || '';
		this.token_type = params.token_type || '';
		this.x_refresh_token_expires_in = params.x_refresh_token_expires_in || 0;
	}

	private calculateExpiresTime(expiresIn?: number): number {
		return expiresIn ? Date.now() + expiresIn * 1000 : 0;
	}
	/**
	 * Get the access token.
	 * @returns {string} The access token.
	 */
	accessToken(): string {
		return this.getToken().access_token;
	}

	/**
	 * Get the refresh token.
	 * @returns {string} The refresh token.
	 */
	refreshToken(): string {
		return this.getToken().refresh_token;
	}

	/**
	 * Get the token type.
	 * @returns {string} The token type.
	 */
	tokenType(): string {
		return this.getToken().token_type;
	}

	/**
	 * Helper method to get token data.
	 * @returns {TokenData} An object containing token details.
	 */
	getToken(): TokenData {
		return {
			token_type: this.token_type,
			access_token: this.access_token,
			expires_in: this.expires_in,
			refresh_token: this.refresh_token,
			x_refresh_token_expires_in: this.x_refresh_token_expires_in,
			realmId: this.realmId,
			id_token: this.id_token,
			createdAt: this.createdAt,
		};
	}

	/**
	 * Helper method to set token data.
	 * @param tokenData - The new token data.
	 * @returns {this} The updated Token instance.
	 */
	setToken(tokenData: TokenParams): this {
		this.access_token = tokenData.access_token || '';
		this.refresh_token = tokenData.refresh_token || '';
		this.token_type = tokenData.token_type || '';
		this.expires_in = tokenData.expires_in || 0;
		this.x_refresh_token_expires_in = tokenData.x_refresh_token_expires_in || 0;
		this.id_token = tokenData.id_token || '';
		this.createdAt = tokenData.createdAt || Date.now();
		return this;
	}

	/**
	 * Helper method to clear token data.
	 * @returns {this} The cleared Token instance.
	 */
	clearToken(): this {
		this.access_token = '';
		this.refresh_token = '';
		this.token_type = '';
		this.expires_in = 0;
		this.x_refresh_token_expires_in = 0;
		this.id_token = '';
		this.createdAt = 0;
		return this;
	}

	private _checkExpiry(expiryTime?: number | string): boolean {
		const now = Date.now();
		const expiry = typeof expiryTime === 'string' ? Number(expiryTime) : expiryTime;
		console.log(`Checking expiry: ${expiry} vs now: ${now}`);
		return expiry ? expiry > now : false;
	}

	isAccessTokenValid(): boolean {
		const valid = this._checkExpiry(this.expires_time);
		console.log(`Access token expiry: ${this.expires_time}, valid: ${valid}`);
		return valid;
	}

	isRefreshTokenValid(): boolean {
		const valid = this._checkExpiry(this.refresh_expires_time);
		console.log(`Refresh token expiry: ${this.refresh_expires_time}, valid: ${valid}`);
		return valid;
	}
}
