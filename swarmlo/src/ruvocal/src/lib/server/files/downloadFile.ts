import { error } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import type { Conversation } from "$lib/types/Conversation";
import type { SharedConversation } from "$lib/types/SharedConversation";
import type { MessageFile } from "$lib/types/Message";

export async function downloadFile(
	sha256: string,
	convId: Conversation["_id"] | SharedConversation["_id"]
): Promise<MessageFile & { type: "base64" }> {
	const files = await collections.bucket
		.find({ filename: `${convId.toString()}-${sha256}` })
		.toArray();

	const file = files[0];
	if (!file) {
		error(404, "File not found");
	}
	if (file.metadata?.conversation !== convId.toString()) {
		error(403, "You don't have access to this file.");
	}

	const mime = String(file.metadata?.mime ?? "");
	const name = file.filename;

	// RVF GridFS exposes async toArray() instead of a data/end event stream
	const chunks = await collections.bucket.openDownloadStream(file._id).toArray();
	const buffer = Buffer.concat(chunks);

	return { type: "base64", name, value: buffer.toString("base64"), mime };
}
