import corsLib from 'cors';

/**
 * Production-safe CORS:
 * - Allow only known origins
 * - Allow server-to-server (no origin header)
 */
const allowedOrigins = new Set<string>(['http://localhost:4200', 'https://yourdomain.com', 'https://www.yourdomain.com']);

export const cors = corsLib({
	origin: (origin, callback) => {
		// No origin = server-to-server request (Twilio, Google, etc.)
		if (!origin) return callback(null, true);

		if (allowedOrigins.has(origin)) return callback(null, true);

		return callback(new Error(`CORS blocked for origin: ${origin}`));
	},
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Twilio-Signature'],
});
