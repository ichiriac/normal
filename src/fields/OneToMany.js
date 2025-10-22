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
    }

    get refModel() {
        return this.model.repo.get(this.refModelName);
    }

    getMetadata() {
        const meta = super.getMetadata();
        meta.foreign = this.definition.foreign;
        delete meta.index;
        delete meta.unique;
        delete meta.required;
        return meta;
    }

    isSameType(type) {
        return ALIAS.indexOf(type) !== -1;
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