'use strict';

const RESULT_METHODS = new Set(['select']);

class Request {
    constructor(model, queryBuilder) {
        this.model = model;
        this.queryBuilder = queryBuilder;

        return new Proxy(this, {
            get: (target, prop, receiver) => {
                if (prop === 'model' || prop === 'queryBuilder') {
                    return target[prop];
                }

                if (prop in target) {
                    return Reflect.get(target, prop, receiver);
                }

                const value = target.queryBuilder[prop];

                if (typeof value === 'function') {
                    return (...args) => {
                        const result = value.apply(target.queryBuilder, args);
                        if (result === target.queryBuilder) {
                            return receiver;
                        }
                        return result;
                    };
                }

                return value;
            },
        });
    }

    async first(...args) {
        this._ensureDefaultIdSelect();
        const row = await this.queryBuilder.first(...args);
        return row ? this.model.allocate(row) : null;
    }

    then(onFulfilled, onRejected) {
        const wrap = this._shouldWrapResults();
        this._ensureDefaultIdSelect();
        return this.queryBuilder.then(
            (value) => {
                if (!wrap) {
                    return onFulfilled ? onFulfilled(value) : value;
                }
                return this._wrapResult(value).then((wrapped) => {
                    if (onFulfilled) {
                        return onFulfilled(wrapped);
                    }
                    return wrapped;
                });
            },
            onRejected
        );
    }

    catch(onRejected) {
        return this.then(null, onRejected);
    }

    finally(onFinally) {
        return this.queryBuilder.finally(onFinally);
    }

    toString() {
        return this.queryBuilder.toString();
    }

    toSQL(...args) {
        return this.queryBuilder.toSQL(...args);
    }

    _shouldWrapResults() {
        const method = this.queryBuilder && this.queryBuilder._method;
        if (!method) return true;
        if (RESULT_METHODS.has(method)) return true;
        return false;
    }

    _ensureDefaultIdSelect() {
        const qb = this.queryBuilder;
        if (!qb) return;
        const method = qb._method;
        // Only apply to read-like queries (avoid insert/update/delete)
        const readLike = !method || method === 'select' || method === 'first';
        if (!readLike) return;
        // Skip if select already specified or select() not available
        if (typeof qb.select !== 'function') return;
        const stmts = Array.isArray(qb._statements) ? qb._statements : [];
        const hasColumns = stmts.some((s) => s && s.grouping === 'columns' && Array.isArray(s.value) && s.value.length > 0);
        if (hasColumns) return;
        const col = this.model && this.model.table ? `${this.model.table}.id` : 'id';
        qb.select(col);
    }

    _wrapResult(value) {
        const wrapRow = (row) => {
            if (!this._isWrappableRow(row)) {
                return row;
            }
            return this.model.allocate(row).ready();
        };

        if (Array.isArray(value)) {
            return Promise.all(value.map(wrapRow));
        }
        return wrapRow(value);
    }

    _isWrappableRow(row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            return false;
        }
        if (this.model && this.model.cls && row instanceof this.model.cls) {
            return false;
        }
        const fields = Object.keys(this.model?.fields || {});
        if (fields.length === 0) {
            return true;
        }
        return fields.some((field) => Object.prototype.hasOwnProperty.call(row, field));
    }
}

module.exports = { Request };