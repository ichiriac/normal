const { Field } = require('./Base');

/**
 * One-to-many relationship field, exemple : comments in a Post model.
 */
class OneToMany extends Field {

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

module.exports = { OneToMany };