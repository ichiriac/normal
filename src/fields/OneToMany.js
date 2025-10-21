const { Field } = require('./Base');

/**
 * One-to-many relationship field, exemple : comments in a Post model.
 */
class OneToMany extends Field {

    constructor(model, name, definition) {
        super(model, name, definition);
        if (!this.definition.foreign) {
            throw new Error(`OneToMany field "${name}" requires a "foreign" definition`);
        }
        const [refModelName, refFieldName] = this.definition.foreign.split('.');
        this.refModel = model.repo.get(refModelName);
        this.refField = refFieldName;
    }

    getMetadata() {
        const meta = super.getMetadata();
        meta.foreign = this.definition.foreign;
        delete meta.index;
        delete meta.unique;
        delete meta.required;
        return meta;
    }

    serialize(record) {
        return undefined;
    }

}

Field.behaviors.onetomany = OneToMany;
Field.behaviors['one-to-many'] = OneToMany;
Field.behaviors['one2many'] = OneToMany;
module.exports = { OneToMany };