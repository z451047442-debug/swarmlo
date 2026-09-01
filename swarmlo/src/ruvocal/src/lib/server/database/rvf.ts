/**
 * RVF Document Store — self-contained, zero-dependency database for RuVocal.
 *
 * Replaces MongoDB with an in-memory document store persisted to a single
 * RVF JSON file on disk. Implements the MongoDB Collection interface used
 * by HF Chat UI so all 56 importing files work unchanged.
 *
 * Storage format:
 * {
 *   rvf_version: "2.0",
 *   collections: { "conversations": { "id1": {...}, ... }, ... },
 *   metadata: { created_at, updated_at, doc_count }
 * }
 */

import { randomUUID } from "crypto";
import {
	readFileSync,
	writeFileSync,
	existsSync,
	mkdirSync,
	renameSync,
	copyFileSync,
	rmSync,
} from "fs";
import { dirname } from "path";

// ---------------------------------------------------------------------------
// ObjectId compatibility
// ---------------------------------------------------------------------------

export class ObjectId {
	private _id: string;
	constructor(id?: string) {
		this._id = id ?? randomUUID();
	}
	toString() {
		return this._id;
	}
	toHexString() {
		return this._id;
	}
	equals(other: ObjectId | string) {
		const otherStr = typeof other === "string" ? other : other.toString();
		return this._id === otherStr;
	}
	toJSON() {
		return this._id;
	}
	static createFromHexString(hex: string) {
		return new ObjectId(hex);
	}
}

// Type aliases for MongoDB compatibility
export type WithId<T> = T & { _id: string | ObjectId };
export type AnyBulkWriteOperation<T> = Record<string, unknown>;
export type FindCursor<T> = RvfCursor<T>;
export type Collection<T> = RvfCollection<T>;

// ---------------------------------------------------------------------------
// RVF persistence
// ---------------------------------------------------------------------------

interface RvfFile {
	rvf_version: string;
	format: string;
	collections: Record<string, Record<string, unknown>>;
	tenants?: Record<string, Record<string, Record<string, unknown>>>;
	metadata: {
		created_at: string;
		updated_at: string;
		doc_count: number;
		multi_tenant?: boolean;
	};
}

let _store: Map<string, Map<string, Record<string, unknown>>> = new Map();
let _dbPath: string = "";
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 500;

// Multi-tenant: per-tenant stores keyed by tenantId
let _tenantStores: Map<string, Map<string, Map<string, Record<string, unknown>>>> = new Map();
let _multiTenantEnabled = false;

export function enableMultiTenant(enabled = true): void {
	_multiTenantEnabled = enabled;
}

export function isMultiTenant(): boolean {
	return _multiTenantEnabled;
}

function getTenantStore(tenantId: string): Map<string, Map<string, Record<string, unknown>>> {
	if (!_tenantStores.has(tenantId)) {
		_tenantStores.set(tenantId, new Map());
	}
	return _tenantStores.get(tenantId)!;
}

export function listTenants(): string[] {
	return [..._tenantStores.keys()];
}

export function getTenantStats(): Record<string, { collections: number; documents: number }> {
	const stats: Record<string, { collections: number; documents: number }> = {};
	for (const [tenantId, store] of _tenantStores) {
		let docCount = 0;
		for (const coll of store.values()) docCount += coll.size;
		stats[tenantId] = { collections: store.size, documents: docCount };
	}
	return stats;
}

export function initRvfStore(dbPath: string): void {
	_dbPath = dbPath;

	if (existsSync(dbPath)) {
		let data: RvfFile | null = null;
		try {
			const raw = readFileSync(dbPath, "utf-8");
			data = JSON.parse(raw) as RvfFile;
		} catch (err) {
			// Corrupt database: NEVER silently discard it. Preserve the broken file
			// (renamed with a timestamp) and log loudly, then attempt recovery from
			// the .bak backup (kept by flushToDisk). Only fall back to a fresh
			// store when no usable backup exists.
			console.error(`[RVF] Corrupt database at ${dbPath}:`, err);
			const corruptPath = `${dbPath}.corrupt-${Date.now()}`;
			try {
				renameSync(dbPath, corruptPath);
				console.error(`[RVF] Corrupted database preserved as ${corruptPath} for inspection.`);
			} catch (renameErr) {
				console.error(`[RVF] Could not preserve corrupted file ${dbPath}:`, renameErr);
			}
			data = null;
		}

		if (!data) {
			// Attempt recovery from the rolling backup before giving up.
			const backupPath = `${dbPath}.bak`;
			if (existsSync(backupPath)) {
				try {
					data = JSON.parse(readFileSync(backupPath, "utf-8")) as RvfFile;
					console.log(`[RVF] Restored database from backup ${backupPath}`);
				} catch (backupErr) {
					console.error(`[RVF] Backup ${backupPath} is also unreadable:`, backupErr);
					data = null;
				}
			}
		}

		if (data) {
			for (const [name, docs] of Object.entries(data.collections)) {
				const map = new Map<string, Record<string, unknown>>();
				for (const [id, doc] of Object.entries(docs)) {
					map.set(id, doc as Record<string, unknown>);
				}
				_store.set(name, map);
			}
			// Load tenant data if present
			if (data.tenants) {
				_multiTenantEnabled = true;
				for (const [tenantId, collections] of Object.entries(data.tenants)) {
					const tenantStore = new Map<string, Map<string, Record<string, unknown>>>();
					for (const [name, docs] of Object.entries(collections)) {
						const map = new Map<string, Record<string, unknown>>();
						for (const [id, doc] of Object.entries(docs)) {
							map.set(id, doc as Record<string, unknown>);
						}
						tenantStore.set(name, map);
					}
					_tenantStores.set(tenantId, tenantStore);
				}
			}
			console.log(
				`[RVF] Loaded ${Object.keys(data.collections).length} collections from ${dbPath}` +
					(_tenantStores.size > 0 ? ` (${_tenantStores.size} tenants)` : "")
			);
		} else {
			// No readable database and no readable backup.
			console.error(
				`[RVF] No usable database or backup at ${dbPath}; starting with an empty store. ` +
					`This may lose data — the corrupted file was preserved for manual recovery.`
			);
			_store = new Map();
		}
	} else {
		console.log(`[RVF] No existing database at ${dbPath}, starting fresh`);
	}
}

function scheduleSave(): void {
	if (_saveTimer) clearTimeout(_saveTimer);
	_saveTimer = setTimeout(() => flushToDisk(), SAVE_DEBOUNCE_MS);
}

export function flushToDisk(): void {
	if (!_dbPath) return;

	const dir = dirname(_dbPath);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	let docCount = 0;
	const collections: Record<string, Record<string, unknown>> = {};
	for (const [name, docs] of _store) {
		const obj: Record<string, unknown> = {};
		for (const [id, doc] of docs) {
			obj[id] = doc;
			docCount++;
		}
		collections[name] = obj;
	}

	// Serialize tenant stores
	const tenants: Record<string, Record<string, Record<string, unknown>>> = {};
	let tenantDocCount = 0;
	if (_multiTenantEnabled) {
		for (const [tenantId, tenantStore] of _tenantStores) {
			const tenantColls: Record<string, Record<string, unknown>> = {};
			for (const [name, docs] of tenantStore) {
				const obj: Record<string, unknown> = {};
				for (const [id, doc] of docs) {
					obj[id] = doc;
					tenantDocCount++;
				}
				tenantColls[name] = obj;
			}
			tenants[tenantId] = tenantColls;
		}
	}

	const rvf: RvfFile = {
		rvf_version: "2.0",
		format: "rvf-database",
		collections,
		...(Object.keys(tenants).length > 0 ? { tenants } : {}),
		metadata: {
			created_at: collections["_meta"]
				? String(
						(collections["_meta"] as Record<string, unknown>)?.created_at ??
							new Date().toISOString()
					)
				: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			doc_count: docCount + tenantDocCount,
			...(_multiTenantEnabled ? { multi_tenant: true } : {}),
		},
	};

	const payload = JSON.stringify(rvf);

	// Rolling backup: snapshot the previous good file before replacing it so a
	// crash mid-write can be recovered from on next startup.
	if (existsSync(_dbPath)) {
		try {
			copyFileSync(_dbPath, `${_dbPath}.bak`);
		} catch (err) {
			console.error(`[RVF] Failed to create backup of ${_dbPath}:`, err);
		}
	}

	// Atomic write: write to a unique temp file in the same directory, then
	// rename over the target. A crash can never leave a truncated/partial db file.
	const tmpPath = `${_dbPath}.tmp-${process.pid}-${randomUUID()}`;
	try {
		writeFileSync(tmpPath, payload, "utf-8");
		renameSync(tmpPath, _dbPath);
	} catch (err) {
		try {
			rmSync(tmpPath, { force: true });
		} catch {
			// best-effort cleanup
		}
		console.error(`[RVF] Failed to write database to ${_dbPath}:`, err);
		throw err;
	}
}

function getCollection(name: string, tenantId?: string): Map<string, Record<string, unknown>> {
	if (tenantId) {
		const tenantStore = getTenantStore(tenantId);
		if (!tenantStore.has(name)) tenantStore.set(name, new Map());
		return tenantStore.get(name)!;
	}
	if (!_store.has(name)) _store.set(name, new Map());
	return _store.get(name)!;
}

// ---------------------------------------------------------------------------
// Filter matching (MongoDB-compatible)
// ---------------------------------------------------------------------------

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
	for (const [key, val] of Object.entries(filter)) {
		if (key === "$or" && Array.isArray(val)) {
			if (!val.some((sub) => matchesFilter(doc, sub as Record<string, unknown>))) return false;
			continue;
		}
		if (key === "$and" && Array.isArray(val)) {
			if (!val.every((sub) => matchesFilter(doc, sub as Record<string, unknown>))) return false;
			continue;
		}

		const docVal = getNestedValue(doc, key);

		if (val === null || val === undefined) {
			if (docVal !== null && docVal !== undefined) return false;
			continue;
		}

		if (val instanceof ObjectId) {
			if (String(docVal) !== val.toString()) return false;
			continue;
		}

		// Detect foreign ObjectId-like objects (e.g. mongodb's ObjectId) that are NOT
		// query operators.  These have a toString()/toHexString() but zero own
		// enumerable entries, so Object.entries() returns [].  Without this guard,
		// such values silently pass the operator loop below, matching ALL documents.
		if (
			typeof val === "object" &&
			val !== null &&
			!Array.isArray(val) &&
			!(val instanceof Date) &&
			typeof (val as Record<string, unknown>).toHexString === "function"
		) {
			if (String(docVal) !== String(val)) return false;
			continue;
		}

		if (typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
			const ops = val as Record<string, unknown>;
			for (const [op, opVal] of Object.entries(ops)) {
				switch (op) {
					case "$exists":
						if (opVal && (docVal === undefined || docVal === null)) return false;
						if (!opVal && docVal !== undefined && docVal !== null) return false;
						break;
					case "$gt":
						if (!((docVal as number) > (opVal as number))) return false;
						break;
					case "$gte":
						if (!((docVal as number) >= (opVal as number))) return false;
						break;
					case "$lt":
						if (!((docVal as number) < (opVal as number))) return false;
						break;
					case "$lte":
						if (!((docVal as number) <= (opVal as number))) return false;
						break;
					case "$ne":
						if (matchesAny(docVal, opVal)) return false;
						break;
					case "$in":
						if (!Array.isArray(opVal) || !opVal.some((v) => matchesAny(docVal, v))) return false;
						break;
					case "$nin":
						if (Array.isArray(opVal) && opVal.some((v) => matchesAny(docVal, v))) return false;
						break;
					case "$not": {
						// $not inverts the inner expression
						const innerFilter = { [key]: opVal } as Record<string, unknown>;
						if (matchesFilter(doc, innerFilter)) return false;
						break;
					}
					case "$regex": {
						const flags = ops.$options === "i" ? "i" : "";
						if (!new RegExp(String(opVal), flags).test(String(docVal ?? ""))) return false;
						break;
					}
					case "$options":
						break; // handled by $regex
					default:
						break;
				}
			}
			continue;
		}

		if (!matchesAny(docVal, val)) return false;
	}
	return true;
}

function isObjectIdLike(v: unknown): v is { toString(): string } {
	return (
		v instanceof ObjectId ||
		(typeof v === "object" &&
			v !== null &&
			typeof (v as Record<string, unknown>).toHexString === "function")
	);
}

/** Type guard for Date that also narrows `unknown` values. */
function isDateValue(v: unknown): v is Date {
	return typeof v === "object" && v !== null && (v as Date) instanceof Date;
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (isDateValue(a) || isDateValue(b)) {
		return isDateValue(a) && isDateValue(b) && (a as Date).getTime() === (b as Date).getTime();
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => deepEqual(v, b[i]));
	}
	if (
		typeof a === "object" &&
		a !== null &&
		typeof b === "object" &&
		b !== null &&
		!isObjectIdLike(a) &&
		!isObjectIdLike(b)
	) {
		const ka = Object.keys(a as Record<string, unknown>);
		const kb = Object.keys(b as Record<string, unknown>);
		if (ka.length !== kb.length) return false;
		return ka.every((k) =>
			deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
		);
	}
	return String(a) === String(b);
}

function matches(a: unknown, b: unknown): boolean {
	if (isObjectIdLike(a)) return a.toString() === String(b);
	if (isObjectIdLike(b)) return String(a) === b.toString();
	// Date vs date-like string (ISO) comparison by timestamp
	if (isDateValue(a) || isDateValue(b)) {
		const ta = isDateValue(a) ? (a as Date).getTime() : Date.parse(String(a));
		const tb = isDateValue(b) ? (b as Date).getTime() : Date.parse(String(b));
		if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb;
	}
	// Objects/arrays compare structurally, never via "[object Object]"
	if (
		typeof a === "object" &&
		a !== null &&
		typeof b === "object" &&
		b !== null &&
		!isObjectIdLike(a) &&
		!isObjectIdLike(b)
	) {
		return deepEqual(a, b);
	}
	return String(a) === String(b);
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined) return undefined;
		if (typeof current === "object" && !Array.isArray(current)) {
			current = (current as Record<string, unknown>)[part];
		} else if (Array.isArray(current)) {
			const idx = parseInt(part, 10);
			if (!isNaN(idx)) {
				current = current[idx];
			} else {
				// Array field access — collect the field value from every element
				// (Mongo semantics: { "arr.field": v } matches if ANY element's
				// field matches). Returns undefined when no element has the field.
				const values = current
					.filter(
						(item) =>
							typeof item === "object" && item !== null && part in (item as Record<string, unknown>)
					)
					.map((item) => (item as Record<string, unknown>)[part]);
				return values.length > 0 ? values : undefined;
			}
		} else {
			return undefined;
		}
	}
	return current;
}

/**
 * Mongo-style matching against a field value: when the value is an array, any
 * element may match (used by $in/$nin/$ne and plain equality on array fields).
 */
function matchesAny(a: unknown, b: unknown): boolean {
	if (Array.isArray(a)) return a.some((item) => matches(item, b));
	return matches(a, b);
}

// ---------------------------------------------------------------------------
// Apply MongoDB update operators
// ---------------------------------------------------------------------------

function applyUpdate(doc: Record<string, unknown>, update: Record<string, unknown>): void {
	const hasOperators = Object.keys(update).some((k) => k.startsWith("$"));

	if (!hasOperators) {
		// Replace-style update (but keep _id)
		const id = doc._id;
		for (const key of Object.keys(doc)) {
			if (key !== "_id") delete doc[key];
		}
		Object.assign(doc, update, { _id: id });
		doc.updatedAt = new Date();
		return;
	}

	if (update.$set) {
		for (const [key, val] of Object.entries(update.$set as Record<string, unknown>)) {
			setNestedValue(doc, key, val);
		}
	}

	if (update.$unset) {
		for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
			deleteNestedValue(doc, key);
		}
	}

	if (update.$inc) {
		for (const [key, val] of Object.entries(update.$inc as Record<string, number>)) {
			const current = (getNestedValue(doc, key) as number) ?? 0;
			setNestedValue(doc, key, current + val);
		}
	}

	if (update.$push) {
		for (const [key, val] of Object.entries(update.$push as Record<string, unknown>)) {
			const arr = (getNestedValue(doc, key) as unknown[]) ?? [];
			if (typeof val === "object" && val !== null && "$each" in (val as Record<string, unknown>)) {
				arr.push(...((val as Record<string, unknown>).$each as unknown[]));
			} else {
				arr.push(val);
			}
			setNestedValue(doc, key, arr);
		}
	}

	if (update.$pull) {
		for (const [key, val] of Object.entries(update.$pull as Record<string, unknown>)) {
			const arr = (getNestedValue(doc, key) as unknown[]) ?? [];
			setNestedValue(
				doc,
				key,
				arr.filter((item) => !matches(item, val))
			);
		}
	}

	if (update.$addToSet) {
		for (const [key, val] of Object.entries(update.$addToSet as Record<string, unknown>)) {
			const arr = (getNestedValue(doc, key) as unknown[]) ?? [];
			if (!arr.some((item) => matches(item, val))) {
				arr.push(val);
			}
			setNestedValue(doc, key, arr);
		}
	}

	doc.updatedAt = new Date();
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
	const parts = path.split(".");
	let current = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
			current[parts[i]] = {};
		}
		current = current[parts[i]] as Record<string, unknown>;
	}
	current[parts[parts.length - 1]] = value;
}

function deleteNestedValue(obj: Record<string, unknown>, path: string): void {
	const parts = path.split(".");
	let current = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		if (!(parts[i] in current)) return;
		current = current[parts[i]] as Record<string, unknown>;
	}
	delete current[parts[parts.length - 1]];
}

// ---------------------------------------------------------------------------
// Sort helper
// ---------------------------------------------------------------------------

/**
 * Normalize a value for comparison: Date objects and ISO date strings both
 * compare numerically; everything else compares as-is (string/number).
 */
function normalizeSortValue(v: unknown): unknown {
	if (v instanceof Date) return v.getTime();
	if (typeof v === "string" && v.length > 0) {
		const t = Date.parse(v);
		if (!Number.isNaN(t)) return t;
	}
	return v;
}

function sortDocs(
	docs: Record<string, unknown>[],
	spec: Record<string, 1 | -1>
): Record<string, unknown>[] {
	return docs.sort((a, b) => {
		for (const [key, dir] of Object.entries(spec)) {
			const va = normalizeSortValue(getNestedValue(a, key));
			const vb = normalizeSortValue(getNestedValue(b, key));
			if (va === vb) continue;
			// MongoDB semantics: null/undefined sort before other values in
			// ascending order (i.e. they are the "smallest" values).
			if (va === undefined || va === null) return -dir;
			if (vb === undefined || vb === null) return dir;
			if ((va as number) < (vb as number)) return -dir;
			if ((va as number) > (vb as number)) return dir;
		}
		return 0;
	});
}

/**
 * Deterministic serialization used for $group grouping keys. Preserves the
 * Date type (so "2026-08-31" as a string and a Date never collide).
 */
function serializeKey(v: unknown): string {
	if (v instanceof Date) return `__date__:${v.getTime()}`;
	if (v === null) return "__null__";
	if (v === undefined) return "__undefined__";
	if (Array.isArray(v)) return `[${v.map(serializeKey).join(",")}]`;
	if (typeof v === "object") {
		return `{${Object.entries(v as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, x]) => `${k}:${serializeKey(x)}`)
			.join(",")}}`;
	}
	return `${typeof v}:${String(v)}`;
}

/**
 * Deep clone a stored value so callers can mutate nested objects without
 * silently corrupting the in-memory store (and losing those updates on the
 * next flush). Dates and ObjectId-like values are preserved.
 */
function cloneValue<T>(value: T): T {
	if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
	if (isObjectIdLike(value)) return value as T;
	if (Array.isArray(value)) return value.map((v) => cloneValue(v)) as unknown as T;
	if (typeof value === "object" && value !== null) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = cloneValue(v);
		}
		return out as unknown as T;
	}
	return value;
}

// ---------------------------------------------------------------------------
// RvfCollection — MongoDB Collection interface
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RvfCollection<T = any> {
	private _tenantId?: string;

	constructor(
		public readonly collectionName: string,
		tenantId?: string
	) {
		this._tenantId = tenantId;
	}

	/** Create a tenant-scoped view of this collection */
	forTenant(tenantId: string): RvfCollection<T> {
		return new RvfCollection<T>(this.collectionName, tenantId);
	}

	get tenantId(): string | undefined {
		return this._tenantId;
	}

	private get docs() {
		return getCollection(this.collectionName, this._tenantId);
	}

	async findOne(
		filter: Record<string, unknown> = {},
		options?: { sort?: Record<string, 1 | -1>; projection?: Record<string, 0 | 1> }
	): Promise<T | null> {
		let results: Record<string, unknown>[] = [];
		for (const doc of this.docs.values()) {
			if (matchesFilter(doc, filter)) results.push(cloneValue(doc));
		}
		if (options?.sort && results.length > 1) {
			results = sortDocs(results, options.sort);
		}
		return (results[0] as T) ?? null;
	}

	find(
		filter: Record<string, unknown> = {},
		options?: { projection?: Record<string, 0 | 1> }
	): RvfCursor<T> {
		return new RvfCursor<T>(this.collectionName, filter, this._tenantId);
	}

	async insertOne(
		doc: Partial<T> & Record<string, unknown>
	): Promise<{ insertedId: ObjectId; acknowledged: boolean }> {
		const id =
			doc._id != null
				? String(doc._id instanceof ObjectId ? doc._id.toString() : doc._id)
				: randomUUID();

		const record: Record<string, unknown> = {
			...doc,
			_id: id,
			createdAt: doc.createdAt ?? new Date(),
			updatedAt: doc.updatedAt ?? new Date(),
		};

		// Store a deep copy so later caller mutations of nested fields do not
		// silently mutate the store (and get lost on the next flush).
		this.docs.set(id, cloneValue(record));
		scheduleSave();
		return { insertedId: new ObjectId(id), acknowledged: true };
	}

	async insertMany(
		docs: Array<Partial<T> & Record<string, unknown>>
	): Promise<{ insertedIds: ObjectId[]; acknowledged: boolean }> {
		const ids: ObjectId[] = [];
		for (const doc of docs) {
			const result = await this.insertOne(doc);
			ids.push(result.insertedId);
		}
		return { insertedIds: ids, acknowledged: true };
	}

	async updateOne(
		filter: Record<string, unknown>,
		update: Record<string, unknown>,
		options?: { upsert?: boolean }
	): Promise<{
		matchedCount: number;
		modifiedCount: number;
		upsertedCount?: number;
		acknowledged: boolean;
	}> {
		// Collect all matching docs to detect duplicates
		const matches: Array<{ id: string; doc: Record<string, unknown> }> = [];
		for (const [id, doc] of this.docs) {
			if (matchesFilter(doc, filter)) {
				matches.push({ id, doc });
			}
		}

		// Deduplicate: if multiple docs match, keep only the newest and delete the rest
		if (matches.length > 1) {
			matches.sort((a, b) => {
				const ta =
					a.doc.updatedAt instanceof Date
						? a.doc.updatedAt.getTime()
						: typeof a.doc.updatedAt === "string"
							? new Date(a.doc.updatedAt).getTime()
							: 0;
				const tb =
					b.doc.updatedAt instanceof Date
						? b.doc.updatedAt.getTime()
						: typeof b.doc.updatedAt === "string"
							? new Date(b.doc.updatedAt).getTime()
							: 0;
				return tb - ta;
			});
			for (let i = 1; i < matches.length; i++) {
				this.docs.delete(matches[i].id);
			}
		}

		if (matches.length > 0) {
			const { id, doc } = matches[0];
			applyUpdate(doc, update);
			this.docs.set(id, doc);
			scheduleSave();
			return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
		}

		if (options?.upsert) {
			// Strip query operators from filter before using as doc fields
			const cleanFilter: Record<string, unknown> = {};
			for (const [key, val] of Object.entries(filter)) {
				if (key.startsWith("$")) continue; // skip top-level operators like $or, $and
				if (
					val !== null &&
					typeof val === "object" &&
					!Array.isArray(val) &&
					!(val instanceof Date)
				) {
					const hasOps = Object.keys(val as Record<string, unknown>).some((k) => k.startsWith("$"));
					if (hasOps) continue; // skip fields with query operators like { $exists: false }
				}
				// Stringify ObjectId-like values for consistent storage
				cleanFilter[key] = isObjectIdLike(val) ? String(val) : val;
			}
			const newDoc: Record<string, unknown> = {
				...cleanFilter,
				...((update.$set as Record<string, unknown>) ?? {}),
				...((update.$setOnInsert as Record<string, unknown>) ?? {}),
			};
			await this.insertOne(newDoc as Partial<T> & Record<string, unknown>);
			return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, acknowledged: true };
		}

		return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
	}

	async updateMany(
		filter: Record<string, unknown>,
		update: Record<string, unknown>
	): Promise<{ matchedCount: number; modifiedCount: number; acknowledged: boolean }> {
		let count = 0;
		for (const [id, doc] of this.docs) {
			if (matchesFilter(doc, filter)) {
				applyUpdate(doc, update);
				this.docs.set(id, doc);
				count++;
			}
		}
		if (count > 0) scheduleSave();
		return { matchedCount: count, modifiedCount: count, acknowledged: true };
	}

	async deleteOne(
		filter: Record<string, unknown>
	): Promise<{ deletedCount: number; acknowledged: boolean }> {
		for (const [id, doc] of this.docs) {
			if (matchesFilter(doc, filter)) {
				this.docs.delete(id);
				scheduleSave();
				return { deletedCount: 1, acknowledged: true };
			}
		}
		return { deletedCount: 0, acknowledged: true };
	}

	async deleteMany(
		filter: Record<string, unknown>
	): Promise<{ deletedCount: number; acknowledged: boolean }> {
		let count = 0;
		for (const [id, doc] of this.docs) {
			if (matchesFilter(doc, filter)) {
				this.docs.delete(id);
				count++;
			}
		}
		if (count > 0) scheduleSave();
		return { deletedCount: count, acknowledged: true };
	}

	async countDocuments(filter: Record<string, unknown> = {}): Promise<number> {
		let count = 0;
		for (const doc of this.docs.values()) {
			if (matchesFilter(doc, filter)) count++;
		}
		return count;
	}

	async distinct(field: string, filter: Record<string, unknown> = {}): Promise<unknown[]> {
		const values = new Set<unknown>();
		for (const doc of this.docs.values()) {
			if (matchesFilter(doc, filter)) {
				const val = getNestedValue(doc, field);
				if (val !== undefined) values.add(val);
			}
		}
		return [...values];
	}

	aggregate<T2 = T>(
		pipeline: Record<string, unknown>[],
		_options?: Record<string, unknown>
	): {
		next: () => Promise<T2 | null>;
		toArray: () => Promise<T2[]>;
		[Symbol.asyncIterator](): AsyncGenerator<T2, void, undefined>;
	} {
		const self = this;
		let _results: T2[] | null = null;
		let _idx = 0;

		const getResults = async (): Promise<T2[]> => {
			if (_results !== null) return _results;
			_results = (await self._aggregateInternal(pipeline)) as unknown as T2[];
			return _results;
		};

		return {
			async next(): Promise<T2 | null> {
				const results = await getResults();
				return _idx < results.length ? results[_idx++] : null;
			},
			async toArray(): Promise<T2[]> {
				return getResults();
			},
			async *[Symbol.asyncIterator](): AsyncGenerator<T2, void, undefined> {
				const results = await getResults();
				for (const row of results) {
					yield row;
				}
			},
		};
	}

	/**
	 * Evaluate an aggregation expression against a document.
	 * Supports field references ("$field"), local variable references
	 * ("$$name" / "$$name.path"), literals, arrays, and common operators
	 * ($dateTrunc, $ifNull, $concatArrays, $map, $filter, comparisons, $add).
	 */
	private evalExpr(
		expr: unknown,
		doc: Record<string, unknown>,
		scope: Record<string, unknown> = {}
	): unknown {
		if (typeof expr === "string") {
			if (expr.startsWith("$$")) {
				const rest = expr.slice(2);
				const dot = rest.indexOf(".");
				const varName = dot === -1 ? rest : rest.slice(0, dot);
				const path = dot === -1 ? "" : rest.slice(dot + 1);
				const base = scope[varName];
				if (path === "" || base === null || base === undefined) return base;
				return getNestedValue(base as Record<string, unknown>, path);
			}
			if (expr.startsWith("$")) return getNestedValue(doc, expr.slice(1));
			return expr;
		}
		if (Array.isArray(expr)) {
			return expr.map((e) => this.evalExpr(e, doc, scope));
		}
		if (expr !== null && typeof expr === "object" && !(expr instanceof Date)) {
			const obj = expr as Record<string, unknown>;
			const keys = Object.keys(obj);
			// Single-operator objects: { $op: arg }
			if (keys.length === 1 && keys[0].startsWith("$")) {
				return this.evalOp(keys[0], obj[keys[0]], doc, scope);
			}
			// Literal object: evaluate each field
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(obj)) out[k] = this.evalExpr(v, doc, scope);
			return out;
		}
		return expr;
	}

	private evalOp(
		op: string,
		arg: unknown,
		doc: Record<string, unknown>,
		scope: Record<string, unknown>
	): unknown {
		switch (op) {
			case "$dateTrunc": {
				const { date, unit } = arg as { date: unknown; unit: string };
				const d = new Date(this.evalExpr(date, doc, scope) as string | number | Date);
				if (Number.isNaN(d.getTime())) return d;
				switch (unit) {
					case "week": {
						// ISO week: Monday-based
						const day = d.getUTCDay();
						const diff = day === 0 ? -6 : 1 - day;
						d.setUTCDate(d.getUTCDate() + diff);
						d.setUTCHours(0, 0, 0, 0);
						return d;
					}
					case "month":
						d.setUTCDate(1);
						d.setUTCHours(0, 0, 0, 0);
						return d;
					case "year":
						d.setUTCMonth(0, 1);
						d.setUTCHours(0, 0, 0, 0);
						return d;
					case "hour":
						d.setUTCMinutes(0, 0, 0);
						return d;
					case "day":
					default:
						d.setUTCHours(0, 0, 0, 0);
						return d;
				}
			}
			case "$ifNull": {
				const [a, b] = arg as unknown[];
				const va = this.evalExpr(a, doc, scope);
				return va === null || va === undefined ? this.evalExpr(b, doc, scope) : va;
			}
			case "$concatArrays": {
				const arrs = (arg as unknown[]).map((a) => this.evalExpr(a, doc, scope));
				return ([] as unknown[]).concat(...arrs.map((a) => (Array.isArray(a) ? a : [])));
			}
			case "$map": {
				const { input, as, in: expr } = arg as { input: unknown; as: string; in: unknown };
				const arr = this.evalExpr(input, doc, scope) as unknown[];
				if (!Array.isArray(arr)) return [];
				return arr.map((item) => this.evalExpr(expr, doc, { ...scope, [as]: item }));
			}
			case "$filter": {
				const { input, as, cond } = arg as { input: unknown; as: string; cond: unknown };
				const arr = this.evalExpr(input, doc, scope) as unknown[];
				if (!Array.isArray(arr)) return [];
				return arr.filter((item) => Boolean(this.evalExpr(cond, doc, { ...scope, [as]: item })));
			}
			case "$gte":
			case "$gt":
			case "$lte":
			case "$lt":
			case "$eq":
			case "$ne": {
				const [a, b] = (arg as unknown[]).map((x) => this.evalExpr(x, doc, scope));
				const na = typeof a === "string" && !Number.isNaN(Date.parse(a)) ? Date.parse(a) : a;
				const nb = typeof b === "string" && !Number.isNaN(Date.parse(b)) ? Date.parse(b) : b;
				switch (op) {
					case "$gte":
						return (na as number) >= (nb as number);
					case "$gt":
						return (na as number) > (nb as number);
					case "$lte":
						return (na as number) <= (nb as number);
					case "$lt":
						return (na as number) < (nb as number);
					case "$eq":
						return matches(a, b);
					case "$ne":
						return !matches(a, b);
				}
				return false;
			}
			case "$add": {
				return (arg as unknown[]).reduce(
					(acc, x) => (acc as number) + ((this.evalExpr(x, doc, scope) as number) ?? 0),
					0
				);
			}
			case "$multiply": {
				return (arg as unknown[]).reduce(
					(acc, x) => (acc as number) * ((this.evalExpr(x, doc, scope) as number) ?? 0),
					1
				);
			}
			case "$substr": {
				const [str, start, len] = (arg as unknown[]).map((x) => this.evalExpr(x, doc, scope));
				return String(str ?? "").substring(
					Number(start ?? 0),
					Number(len ?? 0) + Number(start ?? 0)
				);
			}
			default:
				// Unknown operator: fall back to evaluating the argument
				return this.evalExpr(arg, doc, scope);
		}
	}

	private async _runSubPipeline(
		input: Record<string, unknown>[],
		pipeline: Record<string, unknown>[]
	): Promise<Record<string, unknown>[]> {
		return this._aggregateInternal(pipeline, input) as Promise<Record<string, unknown>[]>;
	}

	private async _aggregateInternal(
		pipeline: Record<string, unknown>[],
		initial?: Record<string, unknown>[]
	): Promise<T[]> {
		let results: Record<string, unknown>[] = initial ?? [...this.docs.values()];

		for (const stage of pipeline) {
			if (stage.$match) {
				results = results.filter((doc) =>
					matchesFilter(doc, stage.$match as Record<string, unknown>)
				);
			} else if (stage.$sort) {
				results = sortDocs(results, stage.$sort as Record<string, 1 | -1>);
			} else if (stage.$limit) {
				results = results.slice(0, stage.$limit as number);
			} else if (stage.$skip) {
				results = results.slice(stage.$skip as number);
			} else if (stage.$project) {
				const proj = stage.$project as Record<string, unknown>;
				const include = Object.entries(proj).filter(([, v]) => v === 1);
				const exclude = Object.entries(proj).filter(([, v]) => v === 0);
				const expressionKeys = Object.entries(proj).filter(([, v]) => v !== 1 && v !== 0);
				const compute = (doc: Record<string, unknown>): Record<string, unknown> => {
					const out: Record<string, unknown> = {};
					if (include.length > 0) {
						out._id = doc._id;
						for (const [key] of include) out[key] = getNestedValue(doc, key);
					} else {
						for (const [key, val] of Object.entries(doc)) {
							if (!exclude.some(([ek]) => ek === key)) out[key] = val;
						}
					}
					for (const [key, val] of expressionKeys) {
						out[key] = this.evalExpr(val, doc);
					}
					return out;
				};
				results = results.map(compute);
			} else if (stage.$group) {
				const group = stage.$group as Record<string, unknown>;
				const groupIdExpr = group._id as unknown;
				const groups = new Map<string, Record<string, unknown>[]>();

				for (const doc of results) {
					const isAll = groupIdExpr === null || groupIdExpr === undefined;
					const key = isAll ? "__all__" : serializeKey(this.evalExpr(groupIdExpr, doc));
					if (!groups.has(key)) groups.set(key, []);
					groups.get(key)!.push(doc);
				}

				results = [];
				for (const [key, docs] of groups) {
					const out: Record<string, unknown> = {
						_id: key === "__all__" ? null : this.evalExpr(groupIdExpr as unknown, docs[0]),
					};
					for (const [field, expr] of Object.entries(group)) {
						if (field === "_id") continue;
						if (expr !== null && typeof expr === "object" && !Array.isArray(expr)) {
							const op = expr as Record<string, unknown>;
							if (op.$sum !== undefined) {
								if (typeof op.$sum === "number") {
									out[field] = docs.length * op.$sum;
								} else {
									out[field] = docs.reduce(
										(acc, d) => acc + ((this.evalExpr(op.$sum, d) as number) ?? 0),
										0
									);
								}
							}
							if (op.$count) out[field] = docs.length;
							if (op.$first !== undefined) out[field] = this.evalExpr(op.$first, docs[0]);
							if (op.$last !== undefined)
								out[field] = this.evalExpr(op.$last, docs[docs.length - 1]);
							if (op.$min !== undefined) {
								out[field] = docs.reduce(
									(acc, d) => {
										const v = this.evalExpr(op.$min, d) as number;
										return acc === undefined || v < acc ? v : acc;
									},
									undefined as unknown as number
								);
							}
							if (op.$max !== undefined) {
								out[field] = docs.reduce(
									(acc, d) => {
										const v = this.evalExpr(op.$max, d) as number;
										return acc === undefined || v > acc ? v : acc;
									},
									undefined as unknown as number
								);
							}
							if (op.$avg !== undefined) {
								const values = docs.map((d) => this.evalExpr(op.$avg, d)) as number[];
								const sum = values.reduce((a, v) => a + (v ?? 0), 0);
								out[field] = values.length > 0 ? sum / values.length : 0;
							}
						}
					}
					results.push(out);
				}
			} else if (stage.$lookup) {
				const lookup = stage.$lookup as Record<string, unknown>;
				const from = lookup.from as string;
				const localField = lookup.localField as string;
				const foreignField = lookup.foreignField as string;
				const as = lookup.as as string;
				const subPipeline = lookup.pipeline as Record<string, unknown>[] | undefined;
				const fromDocs = [...getCollection(from, this._tenantId).values()];
				results = results.map((doc) => {
					const localVal = getNestedValue(doc, localField);
					const copy = cloneValue(doc);
					copy[as] = fromDocs.filter((foreignDoc) => matches(foreignDoc[foreignField], localVal));
					return copy;
				});
				if (subPipeline && subPipeline.length > 0) {
					results = await Promise.all(
						results.map(async (doc) => {
							const copy = cloneValue(doc);
							const joined = copy[as] as Record<string, unknown>[];
							copy[as] = await this._runSubPipeline(joined, subPipeline);
							return copy;
						})
					);
				}
			} else if (stage.$unwind) {
				const unwind = stage.$unwind as string | Record<string, unknown>;
				const path = (typeof unwind === "string" ? unwind : (unwind as { path: string }).path)
					.replace(/^\$/, "")
					.trim();
				const preserveNullAndEmpty =
					typeof unwind === "object"
						? ((unwind as { preserveNullAndEmptyArrays?: boolean }).preserveNullAndEmptyArrays ??
							false)
						: false;
				const next: Record<string, unknown>[] = [];
				for (const doc of results) {
					const arr = getNestedValue(doc, path) as unknown[] | undefined;
					if (!Array.isArray(arr) || arr.length === 0) {
						if (preserveNullAndEmpty) {
							const copy = cloneValue(doc);
							if (arr === undefined || arr === null) {
								setNestedValue(copy, path, null);
							}
							next.push(copy);
						}
						continue;
					}
					for (const item of arr) {
						const copy = cloneValue(doc);
						setNestedValue(copy, path, item);
						next.push(copy);
					}
				}
				results = next;
			} else if (stage.$facet) {
				const facets = stage.$facet as Record<string, Record<string, unknown>[]>;
				const out: Record<string, unknown> = {};
				for (const [name, sub] of Object.entries(facets)) {
					out[name] = await this._runSubPipeline(
						results.map((d) => cloneValue(d)),
						sub
					);
				}
				results = [out];
			} else if (stage.$replaceRoot) {
				const newRoot = (stage.$replaceRoot as { newRoot: unknown }).newRoot;
				results = results.map((doc) => {
					const root = this.evalExpr(newRoot, doc);
					if (root === null || root === undefined || typeof root !== "object") {
						return {};
					}
					return cloneValue(root as Record<string, unknown>);
				});
			} else if (stage.$set) {
				const set = stage.$set as Record<string, unknown>;
				results = results.map((doc) => {
					const copy = cloneValue(doc);
					for (const [k, v] of Object.entries(set)) {
						copy[k] = this.evalExpr(v, doc);
					}
					return copy;
				});
			} else if (stage.$merge) {
				const merge = stage.$merge as Record<string, unknown>;
				const into = merge.into as string;
				const on = (merge.on as string[]) ?? ["_id"];
				const whenMatched = merge.whenMatched ?? "merge";
				const whenNotMatched = merge.whenNotMatched ?? "insert";
				const target = getCollection(into, this._tenantId);
				for (const doc of results) {
					const existing = [...target.values()].find((d) =>
						on.every((k) => matches(getNestedValue(d, k), getNestedValue(doc, k)))
					);
					if (existing) {
						if (whenMatched === "replace") {
							const merged = cloneValue(existing);
							for (const [k, v] of Object.entries(doc)) merged[k] = cloneValue(v);
							target.set(existing._id as string, merged);
						} else if (whenMatched === "fail") {
							throw new Error(`$merge: duplicate key on "${into}" with whenMatched: "fail"`);
						} else {
							// default "merge"
							for (const [k, v] of Object.entries(doc)) existing[k] = cloneValue(v);
						}
					} else if (whenNotMatched === "insert" || whenNotMatched === "fail") {
						const id = doc._id as string | undefined;
						target.set(id ?? randomUUID(), cloneValue(doc));
					}
				}
				scheduleSave();
				results = [];
			}
		}
		return results as T[];
	}

	async createIndex(
		_spec: Record<string, unknown>,
		_options?: Record<string, unknown>
	): Promise<void> {
		// No-op — in-memory store doesn't need indexes
	}

	listIndexes() {
		// Return a cursor-like object with toArray()
		// Always return 3+ items so stats computation doesn't skip
		return {
			toArray: async () => [
				{ key: { _id: 1 }, name: "_id_" },
				{ key: { key: 1 }, name: "key_1" },
				{ key: { createdAt: 1 }, name: "createdAt_1" },
			],
		};
	}

	async bulkWrite(
		ops: Array<Record<string, unknown>>,
		_options?: Record<string, unknown>
	): Promise<{ matchedCount: number; modifiedCount: number; insertedCount: number }> {
		let matchedCount = 0;
		let modifiedCount = 0;
		let insertedCount = 0;
		for (const op of ops) {
			if (op.updateOne) {
				const { filter, update } = op.updateOne as {
					filter: Record<string, unknown>;
					update: Record<string, unknown>;
				};
				const result = await this.updateOne(filter, update);
				matchedCount += result.matchedCount;
				modifiedCount += result.modifiedCount;
			} else if (op.insertOne) {
				const { document } = op.insertOne as { document: Partial<T> & Record<string, unknown> };
				await this.insertOne(document);
				insertedCount++;
			} else if (op.deleteOne) {
				const { filter } = op.deleteOne as { filter: Record<string, unknown> };
				await this.deleteOne(filter);
			}
		}
		return { matchedCount, modifiedCount, insertedCount };
	}

	async findOneAndUpdate(
		filter: Record<string, unknown>,
		update: Record<string, unknown>,
		options?: { upsert?: boolean; returnDocument?: "before" | "after" }
	): Promise<{ value: T | null }> {
		// Deduplicate: if multiple docs match the filter, keep only the newest
		// and remove the rest. This prevents duplicate settings entries.
		const allMatching: Array<{ id: string; doc: Record<string, unknown> }> = [];
		for (const [id, doc] of this.docs) {
			if (matchesFilter(doc, filter)) {
				allMatching.push({ id, doc });
			}
		}
		if (allMatching.length > 1) {
			// Sort by updatedAt desc, keep the newest — handle both Date objects and ISO strings
			allMatching.sort((a, b) => {
				const ta =
					a.doc.updatedAt instanceof Date
						? a.doc.updatedAt.getTime()
						: typeof a.doc.updatedAt === "string"
							? new Date(a.doc.updatedAt).getTime()
							: 0;
				const tb =
					b.doc.updatedAt instanceof Date
						? b.doc.updatedAt.getTime()
						: typeof b.doc.updatedAt === "string"
							? new Date(b.doc.updatedAt).getTime()
							: 0;
				return tb - ta;
			});
			for (let i = 1; i < allMatching.length; i++) {
				this.docs.delete(allMatching[i].id);
			}
			scheduleSave();
		}

		const existing = allMatching.length > 0 ? ({ ...allMatching[0].doc } as T) : null;

		if (!existing && options?.upsert) {
			// Strip query operators from filter before using as doc fields
			const cleanFilter: Record<string, unknown> = {};
			for (const [key, val] of Object.entries(filter)) {
				if (key.startsWith("$")) continue;
				if (
					val !== null &&
					typeof val === "object" &&
					!Array.isArray(val) &&
					!(val instanceof Date)
				) {
					const hasOps = Object.keys(val as Record<string, unknown>).some((k) => k.startsWith("$"));
					if (hasOps) continue;
				}
				cleanFilter[key] = isObjectIdLike(val) ? String(val) : val;
			}
			const newDoc = {
				...cleanFilter,
				...((update.$set as Record<string, unknown>) ?? {}),
			};
			await this.insertOne(newDoc as Partial<T> & Record<string, unknown>);
			return { value: await this.findOne(filter) };
		}

		if (existing) {
			await this.updateOne(filter, update);
			if (options?.returnDocument === "before") {
				return { value: existing };
			}
			return { value: await this.findOne(filter) };
		}

		return { value: null };
	}

	async findOneAndDelete(filter: Record<string, unknown>): Promise<{ value: T | null }> {
		const doc = await this.findOne(filter);
		if (doc) await this.deleteOne(filter);
		return { value: doc };
	}
}

// ---------------------------------------------------------------------------
// Cursor — MongoDB-like chaining
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RvfCursor<T = any> {
	_sort: Record<string, 1 | -1> = {};
	_limit?: number;
	_skip?: number;
	_mapFn?: (doc: unknown) => unknown;
	private _cachedResults: T[] | null = null;
	private _cursorIdx = 0;

	private _tenantId?: string;

	constructor(
		public collectionName: string,
		public filter: Record<string, unknown>,
		tenantId?: string
	) {
		this._tenantId = tenantId;
	}

	sort(spec: Record<string, 1 | -1>): this {
		this._sort = { ...this._sort, ...spec };
		return this;
	}

	limit(n: number): this {
		this._limit = n;
		return this;
	}

	skip(n: number): this {
		this._skip = n;
		return this;
	}

	project<U = T>(_spec: Record<string, 0 | 1>): RvfCursor<U> {
		// Projection not strictly needed for in-memory
		return this as unknown as RvfCursor<U>;
	}

	batchSize(_n: number): this {
		return this;
	}

	map<U>(fn: (doc: T) => U): RvfCursor<U> {
		const mapped = new RvfCursor<U>(this.collectionName, this.filter, this._tenantId);
		mapped._mapFn = fn as unknown as (doc: unknown) => unknown;
		mapped._sort = { ...this._sort };
		mapped._limit = this._limit;
		mapped._skip = this._skip;
		return mapped;
	}

	async toArray(): Promise<T[]> {
		const coll = getCollection(this.collectionName, this._tenantId);
		let results: Record<string, unknown>[] = [];

		for (const doc of coll.values()) {
			if (matchesFilter(doc, this.filter)) {
				results.push(cloneValue(doc));
			}
		}

		if (Object.keys(this._sort).length > 0) {
			results = sortDocs(results, this._sort);
		}

		if (this._skip) {
			results = results.slice(this._skip);
		}

		if (this._limit !== undefined) {
			results = results.slice(0, this._limit);
		}

		let mapped: unknown[] = results;
		if (this._mapFn) {
			mapped = results.map(this._mapFn);
		}
		return mapped as T[];
	}

	private async _ensureCached(): Promise<T[]> {
		if (this._cachedResults === null) {
			this._cachedResults = await this.toArray();
		}
		return this._cachedResults;
	}

	async hasNext(): Promise<boolean> {
		const results = await this._ensureCached();
		return this._cursorIdx < results.length;
	}

	async next(): Promise<T | null> {
		const results = await this._ensureCached();
		return this._cursorIdx < results.length ? results[this._cursorIdx++] : null;
	}

	async tryNext(): Promise<T | null> {
		return this.next();
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<T> {
		const rows = await this.toArray();
		for (const row of rows) {
			yield row;
		}
	}
}

// ---------------------------------------------------------------------------
// GridFS replacement — stores files in-memory + RVF
// ---------------------------------------------------------------------------

/** File metadata entry as returned by RvfGridFSBucket.find (data excluded). */
export interface GridFSFileMeta {
	_id: string;
	filename: string;
	contentType?: string;
	length?: number;
	metadata?: Record<string, unknown>;
	createdAt?: Date;
}

export class RvfGridFSBucket {
	private get files() {
		return getCollection("_files");
	}

	openUploadStream(
		filename: string,
		options?: { metadata?: Record<string, unknown>; contentType?: string }
	) {
		const id = randomUUID();
		const chunks: string[] = [];

		return {
			id: new ObjectId(id),
			write(chunk: Buffer | string) {
				chunks.push(typeof chunk === "string" ? chunk : chunk.toString("base64"));
			},
			end: async () => {
				const data = chunks.join("");
				this.files.set(id, {
					_id: id,
					filename,
					contentType: options?.contentType ?? "application/octet-stream",
					length: data.length,
					data,
					metadata: options?.metadata ?? {},
					createdAt: new Date(),
				});
				scheduleSave();
			},
		};
	}

	openDownloadStream(id: ObjectId | string) {
		const fileId = typeof id === "string" ? id : id.toString();
		const files = this.files;
		return {
			async toArray(): Promise<Buffer[]> {
				const file = files.get(fileId);
				if (!file) throw new Error("File not found");
				return [Buffer.from(file.data as string, "base64")];
			},
		};
	}

	async delete(id: ObjectId | string) {
		const fileId = typeof id === "string" ? id : id.toString();
		this.files.delete(fileId);
		scheduleSave();
	}

	// Synchronous by design: callers use `.find(...).toArray()` / `.next()` like
	// the Mongo GridFS API. (An `async` wrapper would turn the returned object
	// into a Promise and break every call site.)
	find(filter: Record<string, unknown> = {}): {
		toArray: () => Promise<GridFSFileMeta[]>;
		next: () => Promise<GridFSFileMeta | null>;
	} {
		const results: GridFSFileMeta[] = [];
		for (const doc of this.files.values()) {
			if (matchesFilter(doc, filter)) {
				const { data, ...meta } = doc as unknown as GridFSFileMeta & { data: string };
				results.push(meta);
			}
		}
		return {
			toArray: async () => results,
			next: async () => results[0] ?? null,
		};
	}
}
