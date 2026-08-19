#!/usr/bin/env python3
"""BGE-VL multimodal embedding sidecar for swarmlo (ADR-384).

One-shot JSON protocol — invoked by
plugins/swarmlo-bge-vl/scripts/bge-vl.mjs, never run as a server.

LOAD-BEARING DESIGN RULES
  1. Heavy deps (torch / transformers / Pillow / numpy) are imported
     LAZILY inside embed() only. health / self-test / store / search /
     list / delete / purge run on the stdlib — so the storage layer and
     self-test work with no venv at all.
  2. The DB is a SEPARATE file from memory.db (default
     ~/.swarmlo/bge-vl/bge-vl.db, override CLAUDE_FLOW_BGE_VL_DB).
     768-dim vectors must never touch the 1024-dim bge-m3 HNSW space.
     open_db() refuses foreign-dimension DBs.
  3. Every mode prints ONE JSON object to stdout and exits 0 on success,
     2 on usage/storage error, 3 when model deps are missing (degraded).
"""
import argparse
import json
import math
import os
import sqlite3
import struct
import sys

DIM = 768
DEFAULT_DB = os.path.expanduser(
    os.environ.get('CLAUDE_FLOW_BGE_VL_DB', '~/.swarmlo/bge-vl/bge-vl.db')
)


def fail(message, code=2):
    print(json.dumps({'ok': False, 'error': message}))
    sys.exit(code)


def open_db(path):
    try:
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        con = sqlite3.connect(path)
        con.execute(
            'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)'
        )
        con.execute(
            """CREATE TABLE IF NOT EXISTS vectors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                kind TEXT NOT NULL DEFAULT 'text',
                payload TEXT NOT NULL DEFAULT '{}',
                vec BLOB NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )"""
        )
        row = con.execute("SELECT v FROM meta WHERE k = 'dim'").fetchone()
        if row is None:
            con.execute('INSERT INTO meta (k, v) VALUES (?, ?)', ('dim', str(DIM)))
        elif int(row[0]) != DIM:
            con.close()
            fail(
                f'bge-vl.db dim={row[0]} != {DIM} — refusing to mix vector '
                f'spaces. Move or delete {path} and re-create.'
            )
        con.commit()
        return con
    except sqlite3.Error as e:
        fail(f'db error: {e}')


def pack(vec):
    return struct.pack(f'{len(vec)}f', *vec)


def unpack(blob):
    return list(struct.unpack(f'{len(blob) // 4}f', blob))


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)


def mmr_rerank(ranked, lam):
    """ranked: [(cos_to_query, idx, vec)] -> [idx] in MMR order.
    lam = 1.0 -> pure cosine order (no diversity)."""
    if lam >= 1.0 or len(ranked) <= 1:
        return [r[1] for r in ranked]
    pool = [dict(cos=r[0], idx=r[1], vec=r[2]) for r in ranked]
    chosen = []
    while pool:
        best, best_score = None, float('-inf')
        for d in pool:
            div = max((cosine(d['vec'], s['vec']) for s in chosen), default=0.0)
            score = lam * d['cos'] - (1.0 - lam) * div
            if score > best_score:
                best_score, best = score, d
        chosen.append(best)
        pool.remove(best)
    return [d['idx'] for d in chosen]


# ------------------------------------------------------------ commands

def cmd_health(args):
    con = open_db(args.db)
    count = con.execute('SELECT COUNT(*) FROM vectors').fetchone()[0]
    con.close()
    print(json.dumps({'ok': True, 'dim': DIM, 'count': count, 'db': args.db}))


def cmd_store(args):
    vec = json.loads(args.vector)
    if len(vec) != DIM:
        fail(f'vector dim {len(vec)} != {DIM} — 768-dim BGE-VL space only')
    payload = args.payload or '{}'
    json.loads(payload)  # validate JSON
    con = open_db(args.db)
    con.execute(
        'INSERT OR REPLACE INTO vectors (key, kind, payload, vec) VALUES (?,?,?,?)',
        (args.key, args.kind, payload, pack(vec)),
    )
    con.commit()
    con.close()
    print(json.dumps({'ok': True, 'key': args.key, 'dim': DIM}))


def cmd_search(args):
    qvec = json.loads(args.vector)
    if len(qvec) != DIM:
        fail(f'query dim {len(qvec)} != {DIM}')
    con = open_db(args.db)
    rows = con.execute(
        'SELECT id, key, kind, payload, vec FROM vectors'
    ).fetchall()
    con.close()
    scored = []
    for (i, key, kind, payload, blob) in rows:
        v = unpack(blob)
        cos = cosine(qvec, v)
        if args.threshold is None or cos >= args.threshold:
            scored.append({'id': i, 'key': key, 'kind': kind,
                           'payload': payload, 'vec': v, 'cos': cos})
    scored.sort(key=lambda s: s['cos'], reverse=True)
    scored = scored[: args.top_k]
    order = mmr_rerank([(s['cos'], s['id'], s['vec']) for s in scored],
                       args.mmr_lambda)
    by_id = {s['id']: s for s in scored}
    hits = [
        {'id': i, 'key': by_id[i]['key'], 'kind': by_id[i]['kind'],
         'payload': by_id[i]['payload'], 'cosine': round(by_id[i]['cos'], 6)}
        for i in order
    ]
    print(json.dumps({'ok': True, 'hits': hits, 'dim': DIM}))


def cmd_list(args):
    con = open_db(args.db)
    rows = con.execute(
        'SELECT id, key, kind, payload, created_at FROM vectors '
        'ORDER BY id DESC LIMIT ?', (args.limit,)
    ).fetchall()
    con.close()
    items = [{'id': r[0], 'key': r[1], 'kind': r[2],
              'payload': r[3], 'created_at': r[4]} for r in rows]
    print(json.dumps({'ok': True, 'items': items, 'dim': DIM}))


def cmd_delete(args):
    con = open_db(args.db)
    cur = con.execute('DELETE FROM vectors WHERE key = ?', (args.key,))
    con.commit()
    con.close()
    print(json.dumps({'ok': True, 'deleted': cur.rowcount}))


def cmd_purge(args):
    con = open_db(args.db)
    con.execute('DELETE FROM vectors')
    con.commit()
    con.close()
    print(json.dumps({'ok': True, 'purged': True}))


def _expect_refusal(fn, label):
    # Suppress the refusal's error JSON — the one-JSON-object-per-stdout
    # contract must hold, or the relay's JSON.parse would break.
    import contextlib
    import io
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        try:
            fn()
        except SystemExit as e:
            assert e.code == 2, f'{label}: expected exit 2, got {e.code}'
            return
    raise AssertionError(f'{label}: expected refusal, no SystemExit')


def cmd_self_test(args):
    con = open_db(args.db)
    con.execute('DELETE FROM vectors')  # clean slate
    a = [0.1] * 767 + [0.9]             # deterministic synthetic 768-dim
    b = [-0.1] * 767 + [-0.9]
    for key, vec in (('t-a', a), ('t-b', b)):
        con.execute(
            'INSERT INTO vectors (key, kind, payload, vec) VALUES (?,?,?,?)',
            (key, 'text', '{}', pack(vec)),
        )
    con.commit()
    con.close()
    assert abs(cosine(a, a) - 1.0) < 1e-6, 'cosine(a,a) != 1'
    assert cosine(a, b) < 0, 'cosine(a,b) >= 0'
    # dim guard: 767-dim store must be refused (exit 2)
    _expect_refusal(
        lambda: cmd_store(argparse.Namespace(
            db=args.db, key='bad', kind='text', payload='{}',
            vector=json.dumps([0.0] * 767))),
        '767-dim store',
    )
    print(json.dumps({'ok': True, 'self-test': 'pass', 'dim': DIM}))


def main():
    p = argparse.ArgumentParser(prog='bge_vl_embed.py')
    p.add_argument('mode', choices=['health', 'self-test', 'embed', 'store',
                                    'search', 'list', 'delete', 'purge'])
    p.add_argument('--db', default=DEFAULT_DB)
    p.add_argument('--json', action='store_true', help='JSON protocol (ignored; always on)')
    p.add_argument('--key')
    p.add_argument('--kind', default='text')
    p.add_argument('--vector')
    p.add_argument('--payload')
    p.add_argument('--threshold', type=float, default=None)
    p.add_argument('--top-k', type=int, default=10)
    p.add_argument('--mmr-lambda', type=float, default=1.0)
    p.add_argument('--limit', type=int, default=20)
    p.add_argument('--text')
    p.add_argument('--image')
    p.add_argument('--model')
    args = p.parse_args()
    if args.mode == 'health':
        cmd_health(args)
    elif args.mode == 'self-test':
        cmd_self_test(args)
    elif args.mode == 'store':
        cmd_store(args)
    elif args.mode == 'search':
        cmd_search(args)
    elif args.mode == 'list':
        cmd_list(args)
    elif args.mode == 'delete':
        cmd_delete(args)
    elif args.mode == 'purge':
        cmd_purge(args)
    elif args.mode == 'embed':
        fail('embed mode not implemented yet (Task 2)', 2)


if __name__ == '__main__':
    main()
