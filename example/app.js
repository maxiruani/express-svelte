'use strict';

const express = require('express');

const app = express();
const expressSvelte = require('../lib/express-svelte');

app.set('json spaces', 2);

//
// Express svelte setup
//
app.use(expressSvelte({
    viewsDirname: __dirname + '/views',
    bundlesDirname: __dirname + '/public/dist',
    bundlesHost: '/public/dist',
    bundlesPattern: '[name][extname]',
    env: 'development'
}));

//
// Serve public files
//
app.use('/public', express.static(__dirname + '/public'));

//
// Home page
//
app.get('/', function (req, res, next) {

    res.svelte('Page', {
        globalStore: {
            count: 0,
            value: 'Store prop'
        },
        globalProps: {
            value: 'Global prop'
        },
        props: {
            value: 'View prop'
        }
    });
});

//
// Non matched routes handler
//
app.use(function (req, res, next) {

    console.log('app.js 404 url:%s', req.originalUrl);

    res.status(404).json({
        success: false,
        statusCode: 404
    });
});

//
// Error handler
//
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
console.log('app.js Listening at port:4500');