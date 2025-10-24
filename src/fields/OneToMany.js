const { Field } = require('./Base');
const ALIAS = [
    'onetomany',
    'one-to-many',
    'one2many'
];

/**
 * One-to-many relationship field, exemple : comments in a Post model.
 */
class OneToMany extends Field {

    constructor(model, name, definition) {
        super(model, name, definition);
        if (!this.definition.foreign) {
            throw new Error(`OneToMany field "${name}" requires a "foreign" definition`);
        }
        [this.refModelName, this.refFieldName] = this.definition.foreign.split('.');
        this.stored = false;
    }

    get refModel() {
        return this.model.repo.get(this.refModelName);
    }

    getMetadata() {
        const meta = super.getMetadata();
        meta.foreign = this.definition.foreign;
        meta.domain = this.definition.domain;
        delete meta.index;
        delete meta.unique;
        delete meta.required;
        return meta;
    }

    isSameType(type) {
        return ALIAS.indexOf(type) !== -1;
    }

    read(record) {
        let where = {};
        if (this.refFieldName) {
            where[this.refFieldName] = record.id;
        }
        if (this.definition.domain) {
            if (typeof this.definition.domain === 'function') {
                where = this.definition.domain(record, this);
            } else {
                where = { ...where, ...this.definition.domain };
            }
        }
        return this.refModel.where(where);
    }

    serialize(record) {
        return undefined;
    }

    getColumnDefinition() {
        return null;
    }

    async buildPostIndex(metadata) {
        // no post index for one-to-many
        return false;
    }

}

ALIAS.forEach(alias => {
    Field.behaviors[alias] = OneToMany;
});
module.exports = { OneToMany };