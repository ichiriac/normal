# normal
Node Object Relational Mapper (Abstraction Layer) ?

```js
var lib = require('./index');
var client = require('...sql');
var db = new client({ ... });
var session = lib.create(db);

// including models definitions :
require('./model/users')(session);

// sample of a model
module.exports = function(session) {
  return session.declare(
    'users', 
    {
      __construct: function() {
        // ...
      }
    }
  );
};
```