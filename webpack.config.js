const path = require( 'path' );

module.exports = {
    target: "web",
    entry: './src/index.js',
    output: {
        filename: 'piopiy.min.js',
        path: path.resolve( __dirname, 'dist' ),
        libraryTarget: 'var',
        library: 'piopiyjs'
    },
    devServer: {
        contentBase: path.resolve( __dirname, "dist" ),
        watchContentBase: true,
        compress: true,
        port: 9001,
        watchOptions: {
            poll: true
        }
    }
};