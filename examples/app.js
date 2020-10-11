'use strict';

const express = require('express');

const app = express();
const expressSvelte = require('../lib/express-svelte');

app.set('json spaces', 2);

app.use(expressSvelte({
    viewsDirname: __dirname + '/views',
    bundlesDirname: __dirname + '/public',
    bundlesPattern: '[name][extname]',
    env: 'development'
}));

app.use(function (req, res, next) {

    console.log('app.js 404 url:%s', req.originalUrl);

    res.status(404).json({
        success: false,
        statusCode: 404
    });
});

app.use(function (err, req, res, next) {

    console.error('app.js 500 url:%s. Error: %s %s %s', req.originalUrl, err.code || null, err.message, err.stack);

    res.status(500).json({
        success: false,
        statusCode: 500,
        code: err.code || null,
        message: err.message,
        stack: err.stack
    });
});

app.listen(4500);


// TODO: Rollup script to wrap page component and set globals (like app render)
// TODO:
// TODO:
// TODO: