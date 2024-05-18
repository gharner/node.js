import { IRoutes } from '../interfaces';
import { gapi } from './gapi';
import { masEmail } from './masEmail';
import { qb } from './quickbooks';
import { sandbox } from './sandbox';
export const routes: IRoutes[] = [gapi, masEmail, qb, sandbox];
