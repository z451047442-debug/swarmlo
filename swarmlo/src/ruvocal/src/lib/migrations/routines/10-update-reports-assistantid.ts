import { collections } from "$lib/server/database";
import type { Migration } from ".";
import { ObjectId } from "mongodb";

const migration: Migration = {
	_id: new ObjectId("000000000000000000000010"),
	name: "Update reports with assistantId to use contentId",
	up: async () => {
		// RVF does not support MongoDB pipeline updates (array of $set/$unset
		// stages), so implement the same transformation in JS: for every report
		// with a non-null assistantId, set contentId/object and unset assistantId.
		const reports = await collections.reports
			.find({ assistantId: { $exists: true, $ne: null } })
			.toArray();

		for (const report of reports) {
			const assistantId = (report as unknown as Record<string, unknown>).assistantId;
			await collections.reports.updateOne(
				{ _id: report._id },
				{
					$set: {
						object: "assistant",
						contentId: assistantId,
					},
					$unset: { assistantId: "" },
				}
			);
		}
		return true;
	},
};

export default migration;
