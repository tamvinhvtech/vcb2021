const path = require('path');
const mysql = require('mysql');
const configs = require(path.normalize(__dirname + '/../configs/config'));

var pool = mysql.createPool({
  host: configs.db_host,
  port: configs.db_port,
  user: configs.db_user,
  password: configs.db_password,
  database: configs.db_database,
  multipleStatements: true,
  queueLimit: 0,
  waitForConnection: true
});

module.exports = {
    escape: mysql.escape,
    query: function () {
        var queryArgs = Array.prototype.slice.call(arguments),
            events = [],
            eventNameIndex = {};

        pool.getConnection(function (err, conn) {
            if (err) {
                if (eventNameIndex.error) {
                    eventNameIndex.error();
                }
            }
            if (conn) { 
                // console.log('Open thread ID:', conn.threadId);
                var q = conn.query.apply(conn, queryArgs);
                q.on('end', function () {
                    // console.log('Close thread ID:', conn.threadId);
                    conn.release();
                });

                events.forEach(function (args) {
                    q.on.apply(q, args);
                });
            }
        });

        return {
            on: function (eventName, callback) {
                events.push(Array.prototype.slice.call(arguments));
                eventNameIndex[eventName] = callback;
                return this;
            }
        };
    }
};