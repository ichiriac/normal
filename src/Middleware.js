class MiddlewareSystem {
    constructor() {
        this.middlewares = new Map();
        this.cache = new Map();
        this.versions = new Map();
    }

    // Register middleware for specific operations
    use(operation, middleware) {
        if (!this.middlewares.has(operation)) {
            this.middlewares.set(operation, []);
        }
        this.middlewares.get(operation).push(middleware);
    }

    // Execute middleware chain
    async execute(operation, context, next) {
        const middlewares = this.middlewares.get(operation) || [];
        let index = 0;

        const dispatch = async (i) => {
            if (i <= index) throw new Error('next() called multiple times');
            index = i;

            if (i === middlewares.length) {
                return next ? await next(context) : context;
            }

            const middleware = middlewares[i];
            return await middleware(context, () => dispatch(i + 1));
        };

        return dispatch(0);
    }

    // Built-in caching middleware
    cacheMiddleware(ttl = 300000) { // 5 minutes default
        return async (context, next) => {
            const key = this.generateCacheKey(context);
            
            if (context.operation === 'query' && this.cache.has(key)) {
                const cached = this.cache.get(key);
                if (Date.now() - cached.timestamp < ttl) {
                    context.result = cached.data;
                    context.fromCache = true;
                    return context;
                }
            }

            const result = await next();
            
            if (context.operation === 'query' && result.data) {
                this.cache.set(key, {
                    data: result.data,
                    timestamp: Date.now()
                });
            }

            return result;
        };
    }

    // Built-in versioning middleware
    versioningMiddleware() {
        return async (context, next) => {
            if (context.operation === 'create' || context.operation === 'update') {
                const table = context.table;
                const recordId = context.data.id || context.id;
                
                // Store previous version
                if (context.operation === 'update' && context.previousData) {
                    this.storeVersion(table, recordId, context.previousData);
                }

                const result = await next();
                
                // Add version metadata
                if (result.data) {
                    result.data._version = this.getNextVersion(table, recordId);
                    result.data._updatedAt = new Date().toISOString();
                }

                return result;
            }

            return next();
        };
    }

    // Built-in validation middleware
    validationMiddleware(schema) {
        return async (context, next) => {
            if (context.operation === 'create' || context.operation === 'update') {
                const errors = this.validateData(context.data, schema);
                if (errors.length > 0) {
                    throw new Error(`Validation failed: ${errors.join(', ')}`);
                }
            }
            return next();
        };
    }

    // Built-in logging middleware
    loggingMiddleware() {
        return async (context, next) => {
            const start = Date.now();
            console.log(`[${new Date().toISOString()}] ${context.operation} started on ${context.table}`);
            
            try {
                const result = await next();
                const duration = Date.now() - start;
                console.log(`[${new Date().toISOString()}] ${context.operation} completed in ${duration}ms`);
                return result;
            } catch (error) {
                const duration = Date.now() - start;
                console.error(`[${new Date().toISOString()}] ${context.operation} failed in ${duration}ms:`, error.message);
                throw error;
            }
        };
    }

    // Helper methods
    generateCacheKey(context) {
        return `${context.operation}:${context.table}:${JSON.stringify(context.query || context.data)}`;
    }

    storeVersion(table, recordId, data) {
        const versionKey = `${table}:${recordId}`;
        if (!this.versions.has(versionKey)) {
            this.versions.set(versionKey, []);
        }
        this.versions.get(versionKey).push({
            data,
            timestamp: new Date().toISOString(),
            version: this.versions.get(versionKey).length + 1
        });
    }

    getNextVersion(table, recordId) {
        const versionKey = `${table}:${recordId}`;
        const versions = this.versions.get(versionKey) || [];
        return versions.length + 1;
    }

    getVersionHistory(table, recordId) {
        const versionKey = `${table}:${recordId}`;
        return this.versions.get(versionKey) || [];
    }

    validateData(data, schema) {
        const errors = [];
        for (const [field, rules] of Object.entries(schema)) {
            if (rules.required && !data[field]) {
                errors.push(`${field} is required`);
            }
            if (data[field] && rules.type && typeof data[field] !== rules.type) {
                errors.push(`${field} must be of type ${rules.type}`);
            }
        }
        return errors;
    }

    clearCache() {
        this.cache.clear();
    }

    clearVersions() {
        this.versions.clear();
    }
}

// Usage example context factory
class DatabaseContext {
    constructor(operation, table, options = {}) {
        this.operation = operation;
        this.table = table;
        this.data = options.data;
        this.query = options.query;
        this.id = options.id;
        this.previousData = options.previousData;
        this.result = null;
        this.fromCache = false;
    }
}

module.exports = { MiddlewareSystem, DatabaseContext };