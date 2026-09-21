/**
 * Minimal in-memory IndexedDB fake for vitest.
 *
 * jsdom (this repo's `@vitest-environment jsdom`) does not implement
 * IndexedDB, and the repo has no fake-indexeddb dependency (CLAUDE.md:
 * no new deps). Queue modules need a keyPath-based object store with
 * add/put/get/getAll/count/delete plus named indexes (by-status,
 * by-inspection, by-type on the NIR sync queue), each firing
 * onsuccess/onerror asynchronously like the real API — that subset is
 * implemented here rather than pulling in a full IndexedDB polyfill.
 */

type Row = Record<string, unknown>;

class FakeRequest<T> {
  result: T | undefined;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;

  succeed(result: T) {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.());
  }

  fail(error: Error) {
    this.error = error;
    queueMicrotask(() => this.onerror?.());
  }
}

class FakeOpenRequest extends FakeRequest<FakeDatabase> {
  onupgradeneeded: ((event: { target: { result: FakeDatabase } }) => void) | null =
    null;
}

class FakeIndex {
  constructor(
    private readonly rows: Map<string, Row>,
    private readonly field: string,
  ) {}

  getAll(query?: unknown) {
    const req = new FakeRequest<Row[]>();
    const all = Array.from(this.rows.values());
    req.succeed(
      query === undefined ? all : all.filter((row) => row[this.field] === query),
    );
    return req;
  }

  count(query?: unknown) {
    const req = new FakeRequest<number>();
    const all = Array.from(this.rows.values());
    req.succeed(
      query === undefined
        ? all.length
        : all.filter((row) => row[this.field] === query).length,
    );
    return req;
  }
}

class FakeObjectStore {
  constructor(
    private readonly rows: Map<string, Row>,
    private readonly keyPath: string,
    private readonly indexDefs: Map<string, string>,
  ) {}

  createIndex(name: string, keyPath: string, _options?: { unique?: boolean }) {
    this.indexDefs.set(name, keyPath);
  }

  index(name: string) {
    const field = this.indexDefs.get(name);
    if (!field) {
      throw new Error(`Index ${name} not found`);
    }
    return new FakeIndex(this.rows, field);
  }

  add(value: Row) {
    const req = new FakeRequest<undefined>();
    const key = String(value[this.keyPath]);
    if (this.rows.has(key)) {
      req.fail(new Error(`Key ${key} already exists`));
    } else {
      this.rows.set(key, value);
      req.succeed(undefined);
    }
    return req;
  }

  put(value: Row) {
    const req = new FakeRequest<undefined>();
    this.rows.set(String(value[this.keyPath]), value);
    req.succeed(undefined);
    return req;
  }

  get(key: string) {
    const req = new FakeRequest<Row | undefined>();
    req.succeed(this.rows.get(key));
    return req;
  }

  getAll() {
    const req = new FakeRequest<Row[]>();
    req.succeed(Array.from(this.rows.values()));
    return req;
  }

  count() {
    const req = new FakeRequest<number>();
    req.succeed(this.rows.size);
    return req;
  }

  delete(key: string) {
    const req = new FakeRequest<undefined>();
    this.rows.delete(key);
    req.succeed(undefined);
    return req;
  }
}

class FakeTransaction {
  error: Error | null = null;
  onerror: (() => void) | null = null;

  constructor(
    private readonly rows: Map<string, Row>,
    private readonly keyPath: string,
    private readonly indexDefs: Map<string, string>,
  ) {}

  objectStore(_name: string) {
    return new FakeObjectStore(this.rows, this.keyPath, this.indexDefs);
  }
}

class FakeDatabase {
  private readonly stores = new Map<string, Map<string, Row>>();
  private readonly keyPaths = new Map<string, string>();
  private readonly indexes = new Map<string, Map<string, string>>();

  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  createObjectStore(name: string, options: { keyPath: string }) {
    this.stores.set(name, new Map());
    this.keyPaths.set(name, options.keyPath);
    this.indexes.set(name, new Map());
    return new FakeObjectStore(
      this.stores.get(name)!,
      options.keyPath,
      this.indexes.get(name)!,
    );
  }

  transaction(name: string, _mode: string) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    if (!this.indexes.has(name)) this.indexes.set(name, new Map());
    const tx = new FakeTransaction(
      this.stores.get(name)!,
      this.keyPaths.get(name) ?? "id",
      this.indexes.get(name)!,
    );
    return tx;
  }
}

/**
 * Install a fake `indexedDB` global. Returns a cleanup function that
 * restores the previous global — call in `afterEach`.
 */
export function installFakeIndexedDB(): () => void {
  const databases = new Map<string, FakeDatabase>();
  const previous = (globalThis as { indexedDB?: unknown }).indexedDB;

  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open(name: string, _version: number) {
      const req = new FakeOpenRequest();
      const isNew = !databases.has(name);
      const db = databases.get(name) ?? new FakeDatabase();
      if (isNew) databases.set(name, db);

      queueMicrotask(() => {
        if (isNew) {
          req.onupgradeneeded?.({ target: { result: db } });
        }
        req.succeed(db);
      });

      return req;
    },
  };

  return () => {
    (globalThis as { indexedDB?: unknown }).indexedDB = previous;
    databases.clear();
  };
}
