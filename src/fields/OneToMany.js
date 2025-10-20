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
        this.definition.refModel = model.repo.get(refModelName);
        this.definition.refField = refFieldName;
    }

    serialize(record) {
        return undefined;
    }

    onIndex(table) {
        // do nothing here; handled in onIndex of ManyToOne
    }

    column(table) {
        // do nothing here; handled in onIndex of ManyToOne
    }
}

Field.behaviors.onetomany = OneToMany;
Field.behaviors['one-to-many'] = OneToMany;
Field.behaviors['one2many'] = OneToMany;
module.exports = { OneToMany };