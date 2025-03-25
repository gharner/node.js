import admin from 'firebase-admin';

import { firebaseDev, firebaseProd, gregharner } from '../configs';

type FirebaseConfig = {
	databaseURL?: string;
};

// Retrieve the appropriate service account
const firebaseServiceAccount = getProject(process.env.GCLOUD_PROJECT);

if (!firebaseServiceAccount) {
	throw new Error(`No valid Firebase service account found for project: ${process.env.GCLOUD_PROJECT}`);
}

// Retrieve Firebase config
const firebaseConfig = parseFirebaseConfig(process.env.FIREBASE_CONFIG);

// Initialize Firebase Admin SDK only if not already initialized
if (!admin.apps.length) {
	admin.initializeApp({
		credential: admin.credential.cert(firebaseServiceAccount), // Ensured valid service account
		databaseURL: firebaseConfig?.databaseURL,
	});
	admin.firestore().settings({ ignoreUndefinedProperties: true });
}

/**
 * Selects the appropriate Firebase service account based on the GCLOUD_PROJECT environment variable.
 */
function getProject(projectId?: string): admin.ServiceAccount {
	const serviceAccounts: Record<string, admin.ServiceAccount> = {
		'mas-development-53ac7': firebaseDev as admin.ServiceAccount,
		'valiant-splicer-224515': firebaseProd as admin.ServiceAccount,
		'gregharner-84eb9': gregharner as admin.ServiceAccount,
	};

	const serviceAccount = projectId ? serviceAccounts[projectId] : undefined;
	if (!serviceAccount) {
		throw new Error(`Invalid or missing Firebase service account for project: ${projectId}`);
	}
	return serviceAccount;
}

/**
 * Parses the FIREBASE_CONFIG environment variable safely.
 */
function parseFirebaseConfig(config?: string): FirebaseConfig | undefined {
	try {
		return config ? (JSON.parse(config) as FirebaseConfig) : undefined;
	} catch {
		console.error('Invalid FIREBASE_CONFIG JSON');
		return undefined;
	}
}

export { admin };
