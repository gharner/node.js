export function safeStringify(obj: any, space: number = 2): string {
	const cache = new Set();
	return JSON.stringify(
		obj,
		function (key, value) {
			if (typeof value === 'object' && value !== null) {
				if (cache.has(value)) {
					// Circular reference found, discard key
					return;
				}
				// Store value in the cache
				cache.add(value);
			}
			return value;
		},
		space
	);
}

export function logWithTime(label: string, value?: any) {
	const logDate = new Date().toLocaleString('en-US', {
		timeZone: 'America/New_York',
		hour12: false,
	});

	if (value !== undefined) {
		console.log(`${logDate} - ${label}`, value);
	} else {
		console.log(`${logDate} - ${label}`);
	}
}
