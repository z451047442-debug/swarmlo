import type { ObjectId } from "mongodb";
import type { Timestamps } from "./Timestamps";

export interface User extends Timestamps {
	// RVF backend stores _id as a plain string; MongoDB backend as ObjectId.
	_id: ObjectId | string;

	username?: string;
	name: string;
	email?: string;
	avatarUrl: string | undefined;
	hfUserId: string;
	isAdmin?: boolean;
	isEarlyAccess?: boolean;
}
