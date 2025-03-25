import { AxiosResponse } from 'axios';

export interface AuthResponseParams {
	intuit_tid?: string;
	response?: AxiosResponse<any>;
	responseText?: string;
	token?: any; // Replace with your Token type if available
}

export default class AuthResponse {
	static _contentType: string = 'content-type';
	static _jsonContentType: string = 'application/json';
	static _urlencodedContentType: string = 'application/x-www-form-urlencoded';

	body: string;
	intuit_tid: string;
	json: any;
	response: AxiosResponse<any> | null;
	token: any;

	constructor(params: AuthResponseParams = {}) {
		this.token = params.token || '';
		this.response = params.response || null;
		this.body = params.responseText || (params.response ? params.response.data : '') || '';
		this.json = null;
		this.intuit_tid = params.intuit_tid || '';
	}

	processResponse(response: AxiosResponse<any>): void {
		this.response = response;
		this.body = response.data || '';
		this.json = this.body && this.isJson() ? this.body : null;
		this.intuit_tid = response.headers?.intuit_tid || '';
	}

	getToken(): any {
		return this.token.getToken();
	}

	text(): string {
		return this.body;
	}

	status(): number {
		return this.response ? this.response.status : 0;
	}

	headers(): any {
		return this.response ? this.response.headers : {};
	}

	valid(): boolean {
		return this.response !== null && Number(this.response.status) >= 200 && Number(this.response.status) < 300;
	}

	getJson(): any {
		if (!this.isJson()) throw new Error('AuthResponse is not JSON');
		if (!this.json) {
			try {
				this.json = this.body ? JSON.parse(this.body) : null;
			} catch (e) {
				throw new Error('Failed to parse JSON');
			}
		}
		return this.json;
	}

	get_intuit_tid(): string {
		return this.intuit_tid;
	}

	isContentType(contentType: string): boolean {
		return this.getContentType().indexOf(contentType) > -1;
	}

	getContentType(): string {
		return this.response?.headers[AuthResponse._contentType] || '';
	}

	isJson(): boolean {
		return this.isContentType('application/json');
	}
}
