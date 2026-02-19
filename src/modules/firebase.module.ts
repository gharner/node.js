import { Firestore } from '@google-cloud/firestore';
import * as admin from 'firebase-admin';

export const enterpriseDb = new Firestore({
	projectId: process.env.GCLOUD_PROJECT,
	databaseId: 'default', //
});

export const db = new Firestore({
	projectId: process.env.GCLOUD_PROJECT,
	databaseId: '(default)',
});

if (!admin.apps.length) {
	admin.initializeApp();
}

export { admin };
