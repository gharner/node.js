export class CustomError extends Error {
	constructor(message: string, public caller: string, public additionalInfo?: any) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace(this, this.constructor);
	}

	serializeError(): object {
		const serialized: any = {
			message: this.message,
			name: this.name,
			stack: this.stack ? this.stack.replace(/\n/g, '<br>') : '',
		};

		// Add any additional custom properties
		for (const key of Object.keys(this)) {
			serialized[key] = (this as any)[key];
		}

		// Handle known custom properties if the error is a CustomError
		serialized.customProperty = this.caller;

		return serialized;
	}
}
