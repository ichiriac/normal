# normal

Node Object Relational Mapper (Abstraction Layer) ?

[![Build Status](https://travis-ci.org/ichiriac/normal.svg)](https://travis-ci.org/ichiriac/normal)
[![Coverage Status](https://img.shields.io/coveralls/ichiriac/normal.svg)](https://coveralls.io/r/ichiriac/normal)

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