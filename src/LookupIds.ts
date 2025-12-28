// @ts-nocheck - extracted batching helper with minimal typing
import type { Model } from './Model.js';

type AnyMap = { [key: string]: any };

class LookupIds {
  public model: Model;
  public ids: AnyMap;
  private _timeout: any;

  constructor(model: Model) {
    this.model = model;
    this.ids = {};
    this._timeout = null;
  }

  lookup(ids: Array<string | number>): Promise<any[]> {
    const results: Promise<any>[] = [];
    const cache = this.model.cache || (this.model.repo && this.model.repo.cache);
    for (const id of ids) {
      const entry = cache && cache.get(this.model.name + ':' + id);
      if (entry) {
        results.push(Promise.resolve(this.model.allocate(entry)));
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(this.ids, id)) {
        this.ids[id] = [];
      }
      let resolve: (v: any) => void = () => {},
        reject: (e: any) => void = () => {};
      const found = new Promise<any>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      this.ids[id].push([found, resolve, reject]);
      results.push(found);
    }
    if (Object.keys(this.ids).length > 0) {
      if (this._timeout) clearTimeout(this._timeout);
      this._timeout = setTimeout(() => {
        this.fetch();
      }, 1);
    }
    return Promise.all(results);
  }

  async fetch(): Promise<any[]> {
    if (this._timeout) clearTimeout(this._timeout);
    this._timeout = null;
    const pending = this.ids;
    this.ids = {};
    const ids = Object.keys(pending);
    const rows = await this.model.query().column(this.model.columns).whereIn('id', ids);
    const result = rows.map((row: any) => {
      const instance = this.model.allocate(row);
      if (this.model.cache && !this.model.repo.connection.transactional) {
        this.model.cache.set(
          this.model.name + ':' + instance.id,
          instance.toRawJSON(),
          this.model.cacheTTL
        );
      } else {
        instance._flushed = true;
      }
      if (!pending[row.id]) {
        console.error('Unexpected missing promise for id ', row);
        return instance;
      }
      for (const [found, resolve] of pending[row.id]) {
        resolve(instance);
      }
      delete pending[row.id];
      return instance;
    });
    for (const id of Object.keys(pending)) {
      for (const [found, resolve] of pending[id]) {
        resolve(null);
      }
    }
    return result;
  }
}

export { LookupIds };
