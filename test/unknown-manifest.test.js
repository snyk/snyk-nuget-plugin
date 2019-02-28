'use strict';
const test = require('tap').test;
const plugin = require('../lib/index');

test('Should throw error for unrecognized manifest file', function (t) {
  plugin.inspect(null, 'unknown.type')
    .then(function () {
      t.fail();
    }).catch(function (err) {
      t.equal(err.message,
        'Could not determine manifest type for unknown.type');
      t.done();
    });
});
test('Should throw error for unrecognized manifest file', function (t) {
  plugin.inspect(null, 'some.config')
    .then(function () {
      t.fail();
    }).catch(function (err) {
      t.equal(err.message,
        'Could not determine manifest type for some.config');
      t.done();
    });
});
