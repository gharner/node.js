export interface TokenParams {
	realmId?: string;
	token_type?: string;
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	x_refresh_token_expires_in?: number;
	id_token?: string;
	latency?: number;
	createdAt?: number;
}

export interface TokenData {
	token_type: string;
	access_token: string;
	expires_in: number;
	refresh_token: string;
	x_refresh_token_expires_in: number;
	realmId: string;
	id_token: string;
	createdAt: number;
}

export default class Token {
	realmId: string;
	token_type: string;
	access_token: string;
	refresh_token: string;
	expires_in: number;
	x_refresh_token_expires_in: number;
	id_token: string;
	latency: number;
	createdAt: number;

	constructor(params: TokenParams = {}) {
		this.realmId = params.realmId || '';
		this.token_type = params.token_type || '';
		this.access_token = params.access_token || '';
		this.refresh_token = params.refresh_token || '';
		this.expires_in = params.expires_in || 0;
		this.x_refresh_token_expires_in = params.x_refresh_token_expires_in || 0;
		this.id_token = params.id_token || '';
		this.latency = params.latency || 60 * 1000;
		this.createdAt = params.createdAt || Date.now();
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

	/**
	 * Helper method to check token expiry.
	 * @param seconds - The number of seconds until expiry.
	 * @returns {boolean} True if the token is still valid, false otherwise.
	 */
	private _checkExpiry(seconds: number): boolean {
		const expiry = this.createdAt + seconds * 1000;
		return expiry - this.latency > Date.now();
	}

	/**
	 * Check if the access token is valid.
	 * @returns {boolean} True if valid, false if expired.
	 */
	isAccessTokenValid(): boolean {
		return this._checkExpiry(this.expires_in);
	}

	/**
	 * Check if the refresh token is valid.
	 * @returns {boolean} True if valid, false if expired.
	 */
	isRefreshTokenValid(): boolean {
		return this._checkExpiry(this.x_refresh_token_expires_in);
	}
}
