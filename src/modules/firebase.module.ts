import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
	admin.initializeApp();
}

// Default instance
const dbDefault = admin.firestore();

// Named instance (Replace 'enterprisedb' with your actual Database ID)
const enterpriseDb = getFirestore('enterprisedb');

export { admin, dbDefault, enterpriseDb };
