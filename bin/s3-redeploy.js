#!/usr/bin/env node
'use strict';

require('../src')(require('../src/lib/args-processor').parse(process.argv.slice(2)))
  .then(() => console.log('∾∾∾∾∾∾∾ Execution Complete ∾∾∾∾∾∾∾∾'))
  .catch(err => {
    console.log('∾∾∾∾∾∾∾∾ Execution Failed ∾∾∾∾∾∾∾∾∾');
    console.log('Reason:', err.message);
    if (err.originalError) {
      console.log('Original error:', err.originalError.message);
    }
    console.log('Stack trace:');
    console.log(err.stack);
    process.exit(1);
  });
