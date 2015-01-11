var assert = require("assert");
var lib = require("../index");

describe('simple tests', function() {

  it('lib api', function(){
    assert(typeof lib.create === 'function');
    assert(typeof lib.Session === 'function');
    assert(typeof lib.Model === 'function');
    assert(typeof lib.Entity === 'function');
  });
  it('session api', function(){
    var session = lib.create(null, {
      users: {
        table: 'users',
        properties: {
          'id': 'primary',
          'name': 'string(60)',
          'email': 'string(250)',
          'pwd': {
            column: 'password',
            type: 'string(32)'
          }
        },
        relations: {
          
        }
      }
    });
    assert(session.db === null);
    assert(session instanceof lib.Session);
    assert(session.baseModel === lib.Model);
    assert(session.baseEntity === lib.Entity);
  });
});