import { IRoutes } from '../interfaces';
import { gapi } from './gapi';
import { qb } from './quickbooks';
import { sandbox } from './sandbox';
export const routes: IRoutes[] = [gapi, qb, sandbox];
