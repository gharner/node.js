import { IRoutes } from '../interfaces';
import { gapi } from './gapi';
import { htmlScrape } from './htmlScrape';
import { masEmail } from './masEmail';
import { qb } from './quickbooks';
import { sharedContacts } from './sharedContacts';
import { sandbox } from './sandbox';

export const routes: IRoutes[] = [gapi, htmlScrape, masEmail, qb, sharedContacts, sandbox];
