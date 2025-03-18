import atob from 'atob';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import Csrf from 'csrf';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import os from 'os';
import path from 'path';
import getPem from 'rsa-pem-from-mod-exp';
import winston from 'winston';
import AuthResponse from './AuthResponse';
import Token from './Token';

export interface OAuthClientConfig {
	environment: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	token?: any;
	logging?: boolean;
}

export interface MakeApiCallParams {
	url: string;
	method?: string;
	headers?: any;
	body?: any;
	responseType?: AxiosRequestConfig['responseType'];
}

export default class OAuthClient {
	static cacheId: string = 'cacheID';
	static authorizeEndpoint: string = 'https://appcenter.intuit.com/connect/oauth2';
	static tokenEndpoint: string = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
	static revokeEndpoint: string = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
	static userinfo_endpoint_production: string = 'https://accounts.platform.intuit.com/v1/openid_connect/userinfo';
	static userinfo_endpoint_sandbox: string = 'https://sandbox-accounts.platform.intuit.com/v1/openid_connect/userinfo';
	static migrate_sandbox: string = 'https://developer-sandbox.api.intuit.com/v2/oauth2/tokens/migrate';
	static migrate_production: string = 'https://developer.api.intuit.com/v2/oauth2/tokens/migrate';
	static environment: { sandbox: string; production: string } = {
		sandbox: 'https://sandbox-quickbooks.api.intuit.com/',
		production: 'https://quickbooks.api.intuit.com/',
	};
	static jwks_uri: string = 'https://oauth.platform.intuit.com/op/v1/jwks';
	static scopes = {
		Accounting: 'com.intuit.quickbooks.accounting',
		Payment: 'com.intuit.quickbooks.payment',
		Payroll: 'com.intuit.quickbooks.payroll',
		TimeTracking: 'com.intuit.quickbooks.payroll.timetracking',
		Benefits: 'com.intuit.quickbooks.payroll.timetracking',
		Profile: 'profile',
		Email: 'email',
		Phone: 'phone',
		Address: 'address',
		OpenId: 'openid',
		Intuit_name: 'intuit_name',
	};
	//static user_agent: string = `Intuit-OAuthClient-JS_${packageJson.version}_${os.type()}_${os.release()}_${os.platform()}`;
	static user_agent: string = `Intuit-OAuthClient-JS_${os.type()}_${os.release()}_${os.platform()}`;

	environment: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	token: Token;
	logging: boolean;
	logger: winston.Logger | null;
	state: Csrf;

	constructor(config: OAuthClientConfig) {
		this.environment = config.environment;
		this.clientId = config.clientId;
		this.clientSecret = config.clientSecret;
		this.redirectUri = config.redirectUri;
		this.token = new Token(config.token);
		this.logging = !!(Object.prototype.hasOwnProperty.call(config, 'logging') && config.logging === true);
		this.logger = null;
		this.state = new Csrf();

		if (this.logging) {
			const dir = './logs';
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir);
			}
			this.logger = winston.createLogger({
				level: 'info',
				format: winston.format.combine(
					winston.format.timestamp(),
					winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
				),
				transports: [
					new winston.transports.File({
						filename: path.join(dir, 'oAuthClient-log.log'),
					}),
				],
			});
		}
	}

	setAuthorizeURLs(params: { authorizeEndpoint: string; tokenEndpoint: string; revokeEndpoint: string; userInfoEndpoint: string }): this {
		if (!params) {
			throw new Error("Provide the custom authorize URL's");
		}
		OAuthClient.authorizeEndpoint = params.authorizeEndpoint;
		OAuthClient.tokenEndpoint = params.tokenEndpoint;
		OAuthClient.revokeEndpoint = params.revokeEndpoint;
		if (this.environment === 'sandbox') {
			OAuthClient.userinfo_endpoint_sandbox = params.userInfoEndpoint;
		} else {
			OAuthClient.userinfo_endpoint_production = params.userInfoEndpoint;
		}
		return this;
	}

	authorizeUri(params: { scope: string[]; state?: string }): string {
		if (!params.scope) throw new Error('Provide the scopes');
		const queryParams = {
			response_type: 'code',
			redirect_uri: this.redirectUri,
			client_id: this.clientId,
			scope: Array.isArray(params.scope) ? params.scope.join(' ') : params.scope,
			state: params.state || this.state.create(this.state.secretSync()),
		};
		const authUri = `${OAuthClient.authorizeEndpoint}?${new URLSearchParams(queryParams).toString()}`;
		this.log('info', 'The Authorize Uri is :', authUri);
		return authUri;
	}

	createToken(uri: string): Promise<any> {
		return new Promise(resolve => {
			if (!uri) throw new Error('Provide the Uri');
			// Extract query string after the '?' and convert to an object
			const queryStr = uri.split('?').pop() || '';
			const urlParams = new URLSearchParams(queryStr);
			const paramsObj: { [key: string]: string } = {};
			urlParams.forEach((value, key) => {
				paramsObj[key] = value;
			});

			(this.getToken() as any).realmId = paramsObj.realmId || '';
			if ('state' in paramsObj) {
				(this.getToken() as any).state = paramsObj.state;
			}
			const body: any = {};
			if (paramsObj.code) {
				body.grant_type = 'authorization_code';
				body.code = paramsObj.code;
				body.redirect_uri = paramsObj.redirectUri || this.redirectUri;
			}
			const request: AxiosRequestConfig = {
				url: OAuthClient.tokenEndpoint,
				data: body,
				method: 'POST',
				headers: {
					Authorization: `Basic ${this.authHeader()}`,
					'Content-Type': AuthResponse._urlencodedContentType,
					Accept: AuthResponse._jsonContentType,
					'User-Agent': OAuthClient.user_agent,
				},
			};
			resolve(this.getTokenRequest(request));
		})
			.then((res: any) => {
				const authResponse = res.hasOwnProperty('json') ? res : null;
				const json = (authResponse && authResponse.json) || res;
				this.token.setToken(json);
				this.log('info', 'Create Token response is : ', JSON.stringify(authResponse && authResponse.json, null, 2));
				return authResponse;
			})
			.catch((e: any) => {
				this.log('error', 'Create Token () threw an exception : ', JSON.stringify(e, null, 2));
				throw e;
			});
	}

	refresh(): Promise<any> {
		return new Promise(resolve => {
			this.validateToken();
			const body: any = {
				grant_type: 'refresh_token',
				refresh_token: this.getToken().refresh_token,
			};
			const request: AxiosRequestConfig = {
				url: OAuthClient.tokenEndpoint,
				data: body,
				method: 'POST',
				headers: {
					Authorization: `Basic ${this.authHeader()}`,
					'Content-Type': AuthResponse._urlencodedContentType,
					Accept: AuthResponse._jsonContentType,
					'User-Agent': OAuthClient.user_agent,
				},
			};
			resolve(this.getTokenRequest(request));
		})
			.then((res: any) => {
				const authResponse = res.hasOwnProperty('json') ? res : null;
				const json = (authResponse && authResponse.json) || res;
				this.token.setToken(json);
				this.log('info', 'Refresh Token () response is : ', JSON.stringify(authResponse && authResponse.json, null, 2));
				return authResponse;
			})
			.catch((e: any) => {
				this.log('error', 'Refresh Token () threw an exception : ', JSON.stringify(e, null, 2));
				throw e;
			});
	}

	refreshUsingToken(refresh_token: string): Promise<any> {
		return new Promise(resolve => {
			if (!refresh_token) throw new Error('The Refresh token is missing');
			const body: any = {
				grant_type: 'refresh_token',
				refresh_token: refresh_token,
			};
			const request: AxiosRequestConfig = {
				url: OAuthClient.tokenEndpoint,
				data: body,
				method: 'POST',
				headers: {
					Authorization: `Basic ${this.authHeader()}`,
					'Content-Type': AuthResponse._urlencodedContentType,
					Accept: AuthResponse._jsonContentType,
					'User-Agent': OAuthClient.user_agent,
				},
			};
			resolve(this.getTokenRequest(request));
		})
			.then((res: any) => {
				const authResponse = res.hasOwnProperty('json') ? res : null;
				const json = (authResponse && authResponse.json) || res;
				this.token.setToken(json);
				this.log('info', 'Refresh usingToken () response is : ', JSON.stringify(authResponse && authResponse.json, null, 2));
				return authResponse;
			})
			.catch((e: any) => {
				this.log('error', 'Refresh Token () threw an exception : ', JSON.stringify(e, null, 2));
				throw e;
			});
	}

	revoke(params?: { access_token?: string; refresh_token?: string }): Promise<any> {
		return new Promise(resolve => {
			params = params || {};
			const body: any = {};
			body.token = params.access_token || params.refresh_token || (this.getToken().isAccessTokenValid() ? this.getToken().access_token : this.getToken().refresh_token);
			const request: AxiosRequestConfig = {
				url: OAuthClient.revokeEndpoint,
				data: body,
				method: 'POST',
				headers: {
					Authorization: `Basic ${this.authHeader()}`,
					Accept: AuthResponse._jsonContentType,
					'Content-Type': AuthResponse._jsonContentType,
					'User-Agent': OAuthClient.user_agent,
				},
			};
			resolve(this.getTokenRequest(request));
		})
			.then((res: any) => {
				const authResponse = res.hasOwnProperty('json') ? res : null;
				this.token.clearToken();
				this.log('info', 'Revoke Token () response is : ', JSON.stringify(authResponse && authResponse.json, null, 2));
				return authResponse;
			})
			.catch((e: any) => {
				this.log('error', 'Revoke Token () threw an exception : ', JSON.stringify(e, null, 2));
				throw e;
			});
	}

	getUserInfo(): Promise<any> {
		return new Promise(resolve => {
			const request: AxiosRequestConfig = {
				url: this.environment === 'sandbox' ? OAuthClient.userinfo_endpoint_sandbox : OAuthClient.userinfo_endpoint_production,
				method: 'GET',
				headers: {
					Authorization: `Bearer ${this.token.access_token}`,
					Accept: AuthResponse._jsonContentType,
					'User-Agent': OAuthClient.user_agent,
				},
			};
			resolve(this.getTokenRequest(request));
		})
			.then((res: any) => {
				const authResponse = res.hasOwnProperty('json') ? res : null;
				this.log('info', 'The Get User Info () response is : ', JSON.stringify(authResponse && authResponse.json, null, 2));
				return authResponse;
			})
			.catch((e: any) => {
				this.log('error', 'Get User Info () threw an exception : ', JSON.stringify(e, null, 2));
				throw e;
			});
	}

	makeApiCall(params: MakeApiCallParams): Promise<any> {
		return new Promise(resolve => {
			params = params || {};
			const responseType: AxiosRequestConfig['responseType'] = params.responseType || 'json';
			const baseHeaders = {
				Authorization: `Bearer ${this.getToken().access_token}`,
				Accept: AuthResponse._jsonContentType,
				'User-Agent': OAuthClient.user_agent,
			};
			const headers = params.headers && typeof params.headers === 'object' ? { ...baseHeaders, ...params.headers } : { ...baseHeaders };
			const request: AxiosRequestConfig = {
				url: params.url,
				method: params.method || 'GET',
				headers,
				responseType,
			};
			if (params.body) {
				request.data = params.body;
			}
			resolve(this.getTokenRequest(request));
		})
			.then((res: any) => {
				const { body, ...authResponse } = res;
				this.log('info', 'The makeAPICall () response is : ', JSON.stringify(authResponse.json, null, 2));
				if (authResponse.json === null && body) {
					return { ...authResponse, body: body };
				}
				return authResponse;
			})
			.catch((e: any) => {
				this.log('error', 'Get makeAPICall () threw an exception : ', JSON.stringify(e, null, 2));
				throw e;
			});
	}

	validateIdToken(params: any = {}): Promise<boolean> {
		return new Promise(resolve => {
			if (!this.getToken().id_token) throw new Error('The bearer token does not have id_token');
			const id_token = this.getToken().id_token || params.id_token;
			const token_parts = id_token.split('.');
			const id_token_header = JSON.parse(atob(token_parts[0]));
			const id_token_payload = JSON.parse(atob(token_parts[1]));
			if (id_token_payload.iss !== 'https://oauth.platform.intuit.com/op/v1') return resolve(false);
			if (!id_token_payload.aud.find((audience: string) => audience === this.clientId)) return resolve(false);
			if (id_token_payload.exp < Date.now() / 1000) return resolve(false);
			const request: AxiosRequestConfig = {
				url: OAuthClient.jwks_uri,
				method: 'GET',
				headers: {
					Accept: AuthResponse._jsonContentType,
					'User-Agent': OAuthClient.user_agent,
				},
			};
			resolve(this.getKeyFromJWKsURI(id_token, id_token_header.kid, request));
		})
			.then((res: any) => {
				this.log('info', 'The validateIdToken () response is :', JSON.stringify(res, null, 2));
				return !!res;
			})
			.catch((e: any) => {
				this.log('error', 'The validateIdToken () threw an exception : ', JSON.stringify(e, null, 2));
				throw e;
			});
	}

	getKeyFromJWKsURI(id_token: string, kid: string, request: AxiosRequestConfig): Promise<string | jwt.JwtPayload> {
		return this.loadResponse(request)
			.then((response: AxiosResponse<any>): string | jwt.JwtPayload => {
				if (Number(response.status) !== 200) {
					throw new Error('Could not reach JWK endpoint');
				}
				const key = response.data.keys.find((el: any) => el.kid === kid);
				const cert = this.getPublicKey(key.n, key.e);
				return jwt.verify(id_token, cert) as string | jwt.JwtPayload;
			})
			.catch((e: any) => {
				e = this.createError(e);
				this.log('error', 'The getKeyFromJWKsURI () threw an exception : ', JSON.stringify(e, null, 2));
				throw e;
			});
	}

	getPublicKey(modulus: string, exponent: string): string {
		const pem: string = getPem(modulus, exponent);
		return pem;
	}

	getTokenRequest(request: AxiosRequestConfig): Promise<any> {
		const authResponse = new AuthResponse({ token: this.token });
		return this.loadResponse(request)
			.then((response: AxiosResponse<any>): any => {
				authResponse.processResponse(response);
				if (!authResponse.valid()) {
					throw new Error('Response has an Error');
				}
				return authResponse;
			})
			.catch((e: any) => {
				if (!e.authResponse) {
					e = this.createError(e, authResponse);
				}
				throw e;
			});
	}

	validateToken(): void {
		if (!this.token.refreshToken()) throw new Error('The Refresh token is missing');
		if (!this.token.isRefreshTokenValid()) throw new Error('The Refresh token is invalid, please Authorize again.');
	}

	loadResponse(request: AxiosRequestConfig): Promise<AxiosResponse> {
		return axios(request).then(response => response);
	}

	loadResponseFromJWKsURI(request: AxiosRequestConfig): Promise<AxiosResponse> {
		return axios.get(request.url as string, { headers: request.headers }).then(response => response);
	}

	createError(e: any, authResponse?: AuthResponse): any {
		if (!authResponse || authResponse.body === '') {
			e.error = authResponse?.response?.statusText || e.message || '';
			e.authResponse = authResponse || '';
			e.intuit_tid = authResponse?.headers()?.intuit_tid || '';
			e.originalMessage = e.message || '';
			e.error_description = authResponse?.response?.statusText || '';
			return e;
		}

		e.authResponse = authResponse;
		e.originalMessage = e.message;
		e.error = '';

		if ('error' in authResponse.getJson()) {
			e.error = authResponse.getJson().error;
		} else if (authResponse?.response?.statusText) {
			e.error = authResponse.response.statusText;
		} else if (e.message) {
			e.error = e.message;
		}

		e.error_description = '';

		if ('error_description' in authResponse.getJson()) {
			e.error_description = authResponse.getJson().error_description;
		} else if (authResponse?.response?.statusText) {
			e.error_description = authResponse.response.statusText;
		}

		e.intuit_tid = authResponse?.headers()?.intuit_tid || '';
		return e;
	}

	isAccessTokenValid(): boolean {
		return this.token.isAccessTokenValid();
	}

	getToken(): Token {
		return this.token;
	}

	setToken(params: any): Token {
		this.token = new Token(params);
		return this.token;
	}

	authHeader(): string {
		const apiKey = `${this.clientId}:${this.clientSecret}`;
		return typeof btoa === 'function' ? btoa(apiKey) : Buffer.from(apiKey).toString('base64');
	}

	log(level: string, message: string, messageData: any): void {
		if (this.logging && this.logger) {
			this.logger.log(level, message + messageData);
		}
	}
}
