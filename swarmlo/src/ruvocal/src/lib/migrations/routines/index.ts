import type { ObjectId } from "mongodb";

import type { Database } from "$lib/server/database";
import m01 from "./01-update-search-assistants";
import m02 from "./02-update-assistants-models";
import m04 from "./04-update-message-updates";
import m05 from "./05-update-message-files";
import m06 from "./06-trim-message-updates";
import m08 from "./08-update-featured-to-review";
import m09 from "./09-delete-empty-conversations";
import m10 from "./10-update-reports-assistantid";

export interface Migration {
	_id: ObjectId;
	name: string;
	up: (client: Database) => Promise<boolean>;
	down?: (client: Database) => Promise<boolean>;
	runForFreshInstall?: "only" | "never"; // leave unspecified to run for both
	runForHuggingChat?: "only" | "never"; // leave unspecified to run for both
	runEveryTime?: boolean;
}

// Explicitly registered — the migration system was dead code while this array
// stayed empty (none of the 8 routines were ever imported).
export const migrations: Migration[] = [m01, m02, m04, m05, m06, m08, m09, m10];
