var _ = require('lodash');
var mssql = require('mssql');
var Query = require('./query');
var sql = require('./sql.js');
var utils = require('./utils');
// var CursorJoin = require('waterline-cursor');
var Promise = require('bluebird');

// for util
var moment = require("moment");


/**
 * sails-sqlserver
 *
 * Most of the methods below are optional.
 *
 * If you don't need / can't get to every method, just implement
 * what you have time for.  The other methods will only fail if
 * you try to call them!
 *
 * For many adapters, this file is all you need.  For very complex adapters,
 * you may need more flexiblity. In any case, it's probably a good idea to
 * start with one file and refactor only if necessary. If you do go that route,
 * it's conventional in Node to create a `./lib` directory for your private
 * submodules and load them at the top of the file with other dependencies.
 * e.g. var update = `require('./lib/update')`;
 */
module.exports = (function () {
  // You'll want to maintain a reference to each connection
  // that gets registered with this adapter.
  var connections = {};

  // You may also want to store additional, private data
  // per-connection (esp. if your data store uses persistent
  // connections).
  //
  // Keep in mind that models can be configured to use different databases
  // within the same app, at the same time.
  //
  // i.e. if you're writing a MariaDB adapter, you should be aware that one
  // model might be configured as `host="localhost"` and another might be using
  // `host="foo.com"` at the same time.  Same thing goes for user, database,
  // password, or any other config.
  //
  // You don't have to support this feature right off the bat in your
  // adapter, but it ought to get done eventually.
  //

  var util = {
    parseWherePhrase: function parseWherePhrase(options) {
      var tableAs = options.tableAs;
      var waterlineWhere = options.where;
      if (!waterlineWhere) { // curry
        return function (_waterlineWhere) {
          parseWherePhrase({ tableAs, where: _waterlineWhere });
        }
      }
      var keys = Object.keys(waterlineWhere);
      if (keys.length > 1) {
        return keys.map(function (key) { return parseWherePhrase({ tableAs, where: { [key]: waterlineWhere[key] } }) }).join(' AND ')
      }
      else {
        // todo: handle conatins
        // if value is "contains", then
        var leftHandSide = keys[0];
        var rightHandSide = waterlineWhere[keys[0]];
        if (leftHandSide === 'or' && _.isArray(rightHandSide)) {
          return `((${rightHandSide.map(function (item) { return util.parseWherePhrase({ tableAs, where: item }) }).join(') OR (')}))`;
        }
        if (_.isObject(rightHandSide)) {
          if (_.isArray(rightHandSide)) {
            if (rightHandSide.length === 1) {
              if (rightHandSide[0] === null) {
                return `[${tableAs}].[${leftHandSide}] is null`
              }
              if (typeof rightHandSide[0] === 'undefined') {
                // don't want anything to ever be returned when the query asks for undefined (not the same as null)
                return `1 = 0`
              }
            }

            var hadNull = (rightHandSide.indexOf(null) > -1);
            var valuesWithoutNull = _.filter(rightHandSide, (value) => { return !_.isNull(value) });
            if (hadNull) {
              return `(([${tableAs}].[${leftHandSide}] IS NULL) OR ([${tableAs}].[${leftHandSide}] IN (${util.prepareValue({ value: valuesWithoutNull })})))`
            }
            else {
              return `[${tableAs}].[${leftHandSide}] IN (${util.prepareValue({ value: valuesWithoutNull })})`
            }
          }
          if (_.has(rightHandSide, '<')) {
            return `[${tableAs}].[${leftHandSide}] < ${util.prepareValue({ value: rightHandSide['<'] })}`
          }
          if (_.has(rightHandSide, 'lessThan')) {
            return `[${tableAs}].[${leftHandSide}] < ${util.prepareValue({ value: rightHandSide['lessThan'] })}`
          }
          if (_.has(rightHandSide, '<=')) {
            return `[${tableAs}].[${leftHandSide}] <= ${util.prepareValue({ value: rightHandSide['<='] })}`
          }
          if (_.has(rightHandSide, 'lessThanOrEqual')) {
            return `[${tableAs}].[${leftHandSide}] <= ${util.prepareValue({ value: rightHandSide['lessThanOrEqual'] })}`
          }
          if (_.has(rightHandSide, '>')) {
            return `[${tableAs}].[${leftHandSide}] > ${util.prepareValue({ value: rightHandSide['>'] })}`
          }
          if (_.has(rightHandSide, 'greaterThan')) {
            return `[${tableAs}].[${leftHandSide}] > ${util.prepareValue({ value: rightHandSide['greaterThan'] })}`
          }
          if (_.has(rightHandSide, '>=')) {
            return `[${tableAs}].[${leftHandSide}] >= ${util.prepareValue({ value: rightHandSide['>='] })}`
          }
          if (_.has(rightHandSide, 'greaterThanOrEqual')) {
            return `[${tableAs}].[${leftHandSide}] >= ${util.prepareValue({ value: rightHandSide['greaterThanOrEqual'] })}`
          }
          if (_.has(rightHandSide, '!') && _.isArray(rightHandSide['!'])) {
            var hadNull = (rightHandSide['!'].indexOf(null) > -1);
            var valuesWithoutNull = _.filter(rightHandSide['!'], (value) => { return !_.isNull(value) });
            if (hadNull) {
              return `(([${tableAs}].[${leftHandSide}] IS NOT NULL) AND ([${tableAs}].[${leftHandSide}] NOT IN (${util.prepareValue({ value: valuesWithoutNull })})))`
            }
            else {
              return `[${tableAs}].[${leftHandSide}] NOT IN (${util.prepareValue({ value: valuesWithoutNull })})`
            }
          }
          if (_.has(rightHandSide, '!')) {
            if (`${util.prepareValue({ value: rightHandSide['!'] })}` === 'null') {
              return `[${tableAs}].[${leftHandSide}] is not null`
            }
            else {
              return `[${tableAs}].[${leftHandSide}] <> ${util.prepareValue({ value: rightHandSide['!'] })}`
            }
          }
          if (_.has(rightHandSide, 'not')) {
            if (`${util.prepareValue({ value: rightHandSide['not'] })}` === 'null') {
              return `[${tableAs}].[${leftHandSide}] is not null`
            }
            else {
              return `[${tableAs}].[${leftHandSide}] <> ${util.prepareValue({ value: rightHandSide['not'] })}`
            }
          }
          if (_.has(rightHandSide, 'like')) {
            return `[${tableAs}].[${leftHandSide}] LIKE ${util.prepareValue({ value: rightHandSide.like })}`
          }
          if (_.has(rightHandSide, 'contains')) {
            return `[${tableAs}].[${leftHandSide}] LIKE ${util.prepareValue({ value: `%${rightHandSide.contains}%` })}`
          }
          if (_.has(rightHandSide, 'startsWith')) {
            return `[${tableAs}].[${leftHandSide}] LIKE ${util.prepareValue({ value: `${rightHandSide.startsWith}%` })}`
          }
          if (_.has(rightHandSide, 'endsWith')) {
            return `[${tableAs}].[${leftHandSide}] LIKE ${util.prepareValue({ value: `%${rightHandSide.endsWith}` })}`
          }
        }
        else {
          if (`${util.prepareValue({ value: rightHandSide })}` === 'null') {
            return `[${tableAs}].[${leftHandSide}] is null`
          }
          else {
            return `[${tableAs}].[${leftHandSide}] = ${util.prepareValue({ value: rightHandSide })}`
          }

        }
      }

    },

    parseOrderByPhrase: function (options) {
      var tableAs;
      var sort;
      tableAs = options && options.tableAs;
      sort = options && options.sort;
      if (!sort) {
        return '';
      }
      var orderParts = [];
      _.each(sort, function (direction, attributeName) {
        orderParts.push(`[${tableAs}].[${attributeName}] ${direction === 1 ? 'ASC' : 'DESC'}`)
      })
      return `ORDER BY ${orderParts.join(', ')}`
    },

    prepareValue: function prepareValue(options) {
      var value = options.value;
      if (_.isDate({ date: value })) {
        value = util.toSqlDate(value);
      }
      if (_.isFunction(value)) {
        value = value.toString();
      }
      if (_.isString(value)) {
        util.escape({ value });
        value = `'${value}'`
      }
      if (_.isArray(value)) {
        value = _.without(value, undefined);
        value = _.without(value, null);
        value = value.map(function (item) {
          return prepareValue({ value: item })
        }).join(', ');
      }
      if (_.isBoolean(value)) {
        value = value ? 1 : 0;
      }
      return value;
    },
    escape: function escape(options) {
      var value = options.value;
      value = value.replace(/'/g, `''`);
    },
    toSqlDate: function toSqlDate(options) {
      var date = options.date;
      return moment(date).utc().format('YYYY-MM-DD HH:mm:ss');
    }
  };


  var adapter = {
    // Set to true if this adapter supports (or requires) things like data
    // types, validations, keys, etc. If true, the schema for models using this
    // adapter will be automatically synced when the server starts. Not
    // terribly relevant if your data store is not SQL/schemaful.  If setting
    // syncable, you should consider the migrate option, which allows you to
    // set how the sync will be performed. It can be overridden globally in an
    // app (config/adapters.js) and on a per-model basis.  IMPORTANT: `migrate`
    // is not a production data migration solution! In production, always use
    // `migrate: safe`  drop   => Drop schema and data, then recreate it alter
    // => Drop/add columns as necessary. safe   => Don't change anything (good
    // for production DBs)
    util,
    syncable: true,

    // Default configuration for connections
    defaults: {
      port: process.env.MSSQL_PORT || 1433,
      host: process.env.MSSQL_HOST || 'localhost',
      database: process.env.MSSQL_DATABASE,
      user: process.env.MSSQL_USER,
      password: process.env.MSSQL_PASSWORD,
      schema: true,

      connectionTimeout: 60 * 1000,
      requestTimeout: 60 * 1000,
      persistent: false,

      options: {
        encrypt: false
      },

      pool: {
        min: 5,
        max: 30,
        idleTimeout: 300 * 1000
      }
    },

    /**
     *
     * This method runs when a model is initially registered
     * at server-start-time.  This is the only required method.
     *
     * @param  {[type]}   connection [description]
     * @param  {[type]}   collection [description]
     * @param  {Function} cb         [description]
     * @return {[type]}              [description]
     */
    registerConnection: function (connection, collections, cb) {
      if (!connection.identity) return cb(new Error('Connection is missing an identity.'));
      if (connections[connection.identity]) return cb(new Error('Connection is already registered.'));

      // Add in logic here to initialize connection
      // e.g. connections[connection.identity] = new Database(connection,
      // collections);
      connections[connection.identity] = {
        config: connection,
        collections: collections
      };

      return cb();
    },

    /**
     * Ensures that the given connection is connected with the marshalled
     * configuration.
     * @param {String} connection
     * @param {Function} cb
     */
    connectConnection: function (connection, cb) {
      var uniqId = _.uniqueId();
      var isPersistent = connections[connection].config.persistent;
      connections[connection].persistent = isPersistent;

      if (
        isPersistent &&
        (!connections[connection].mssqlConnection ||
          !connections[connection].mssqlConnection.connected)
      ) {
        connections[connection].mssqlConnection = new mssql.ConnectionPool(
          marshalConfig(connections[connection].config)
        );
        connections[connection].mssqlConnection.connect().then(
          function () {
            cb();
          },
          function (error) {
            cb(error);
          }
        );
      } else if (
        !isPersistent &&
        (!connections[connection].mssqlConnection ||
          !connections[connection].mssqlConnection[uniqId] ||
          !connections[connection].mssqlConnection[uniqId].connected)
      ) {
        if (!connections[connection].mssqlConnection) {
          connections[connection].mssqlConnection = [];
        }

        connections[connection].mssqlConnection[uniqId] = new mssql.ConnectionPool(marshalConfig(connections[connection].config));
        connections[connection].mssqlConnection[uniqId].connect()
          .then(function () {
            cb(null, uniqId);
          }, function (error) {
            cb(error);
          });
      } else {
        _.defer(cb);
      }
    },

    /**
     * Fired when a model is unregistered, typically when the server
     * is killed. Useful for tearing-down remaining open connections,
     * etc.
     *
     * @param  {Function} cb [description]
     * @return {[type]}      [description]
     */
    // Teardown a Connection
    teardown: function (conn, cb) {
      if (typeof conn == 'function') {
        cb = conn;
        conn = null;
      }
      if (!conn) {
        _.each(connections, function (c) {
          if (c.persistent) {
            c.mssqlConnection && c.mssqlConnection.close();
          } else {
            _.each(c.mssqlConnection, function (handle) {
              handle && handle.close();
            });
          }
        });
        connections = {};
        return cb();
      }
      if (!connections[conn]) return cb();

      if (connections[conn].persistent) {
        connections[conn].mssqlConnection.close();
      } else {
        _.each(connections[conn], function (handle) {
          handle.mssqlConnection && handle.mssqlConnection.close();
        });
      }
      delete connections[conn];

      cb();
    },

    // Return attributes
    describe: function (connection, collection, cb) {
      // Add in logic here to describe a collection (e.g. DESCRIBE TABLE logic)
      var schemaName = getSchemaName(connection, collection);
      var statement =
        "SELECT c.name AS ColumnName,TYPE_NAME(c.user_type_id) AS TypeName,c.is_nullable AS Nullable,c.is_identity AS AutoIncrement,ISNULL((SELECT is_unique FROM sys.indexes i LEFT OUTER JOIN sys.index_columns ic ON i.index_id=ic.index_id WHERE i.object_id=t.object_id AND ic.object_id=t.object_id AND ic.column_id=c.column_id),0) AS [Unique],ISNULL((SELECT is_primary_key FROM sys.indexes i LEFT OUTER JOIN sys.index_columns ic ON i.index_id=ic.index_id WHERE i.object_id=t.object_id AND ic.object_id=t.object_id AND ic.column_id=c.column_id),0) AS PrimaryKey,ISNULL((SELECT COUNT(*) FROM sys.indexes i LEFT OUTER JOIN sys.index_columns ic ON i.index_id=ic.index_id WHERE i.object_id=t.object_id AND ic.object_id=t.object_id AND ic.column_id=c.column_id),0) AS Indexed FROM sys.tables t INNER JOIN sys.columns c ON c.object_id=t.object_id LEFT OUTER JOIN sys.index_columns ic ON ic.object_id=t.object_id WHERE t.name='" +
        collection +
        "' AND OBJECT_SCHEMA_NAME(t.object_id) = '" +
        schemaName +
        "'";
      adapter.connectConnection(connection, function __DESCRIBE__(err, uniqId) {
        if (err) {
          console.error(err);
          return cb(err);
        }

        uniqId = uniqId || false;
        var mssqlConnect;
        if (!uniqId) {
          mssqlConnect = connections[connection].mssqlConnection;
        } else {
          mssqlConnect = connections[connection].mssqlConnection[uniqId];
        }

        var request = new mssql.Request(mssqlConnect);
        request.query(statement, function (err, recordset) {
          if (err) return cb(err);
          recordset = recordset.recordset; // mssql 4.x wraps in recordset

          if (recordset.length === 0) return cb();
          var normalizedSchema = sql.normalizeSchema(recordset);
          connections[connection].config.schema = normalizedSchema;
          if (!connections[connection].persistent) {
            mssqlConnect && mssqlConnect.close();
          }
          cb(null, normalizedSchema);
        });
      });
    },

    /**
     *
     * REQUIRED method if integrating with a schemaful
     * (SQL-ish) database.
     *
     */
    define: function (connection, collection, definition, cb) {
      // Add in logic here to create a collection (e.g. CREATE TABLE logic)
      adapter.connectConnection(connection, function __DEFINE__(err, uniqId) {
        if (err) {
          console.error(err);
          return cb(err);
        }
        var schema = sql.schema(collection, definition);
        var schemaName = getSchemaName(connection, collection);
        var tableName = '[' + schemaName + ']' + '.[' + collection + ']';
        var statement = 'CREATE TABLE ' + tableName + ' (' + schema + ')';

        uniqId = uniqId || false;
        var mssqlConnect;
        if (!uniqId) {
          mssqlConnect = connections[connection].mssqlConnection;
        } else {
          mssqlConnect = connections[connection].mssqlConnection[uniqId];
        }

        var request = new mssql.Request(mssqlConnect);
        request.query(statement, function (err, recordset) {
          if (err) return cb(err);
          recordset = recordset.recordset; // mssql 4.x wraps in recordset
          if (!connections[connection].persistent) {
            mssqlConnect && mssqlConnect.close();
          }
          cb(null, {});
        });
      });
    },

    /**
     *
     * REQUIRED method if integrating with a schemaful
     * (SQL-ish) database.
     *
     */
    drop: function (connection, collection, relations, cb) {
      // Add in logic here to delete a collection (e.g. DROP TABLE logic)
      var schemaName = getSchemaName(connection, collection);
      var tableName = '[' + schemaName + ']' + '.[' + collection + ']';
      var statement =
        "IF OBJECT_ID('" +
        tableName +
        "', 'U') IS NOT NULL DROP TABLE " +
        tableName;
      adapter.connectConnection(connection, function __DROP__(err, uniqId) {
        if (err) {
          console.error(err);
          return cb(err);
        }

        uniqId = uniqId || false;
        var mssqlConnect;
        if (!uniqId) {
          mssqlConnect = connections[connection].mssqlConnection;
        } else {
          mssqlConnect = connections[connection].mssqlConnection[uniqId];
        }

        var request = new mssql.Request(mssqlConnect);
        request.query(statement, function (err) {
          if (err) return cb(err);
          if (!connections[connection].persistent) {
            mssqlConnect && mssqlConnect.close();
          }
          cb(null, {});
        });
      });
    },

    /**
     *
     * REQUIRED method if users expect to call Model.find(), Model.findOne(),
     * or related.
     *
     * You should implement this method to respond with an array of instances.
     * Waterline core will take care of supporting all the other different
     * find methods/usages.
     *
     */
    find: function (connection, collection, options, cb) {
      // Check if this is an aggregate query and that there is something to return
      if (options.groupBy || options.sum || options.average || options.min || options.max) {
        if (!options.sum && !options.average && !options.min && !options.max) {
          return cb(new Error('Cannot groupBy without a calculation'));
        }
      }

      utils.convertDates({ attributes: connections[connection].collections[collection]._attributes, where: options.where });

      options.__primaryKey__ = adapter.getPrimaryKey(connection, collection);
      var schemaName = getSchemaName(connection, collection);
      var tableName = '[' + schemaName + ']' + '.[' + collection + ']';
      var statement = sql.selectQuery(tableName, options);
      adapter.connectConnection(connection, function __FIND__(err, uniqId) {
        if (err) {
          console.error(err);
          return cb(err);
        }

        uniqId = uniqId || false;
        var mssqlConnect;
        if (!uniqId) {
          mssqlConnect = connections[connection].mssqlConnection;
        } else {
          mssqlConnect = connections[connection].mssqlConnection[uniqId];
        }

        var request = new mssql.Request(mssqlConnect);
        if (process.env.NODE_DEBUG && process.env.NODE_DEBUG.indexOf('sails-sqlserver') > -1) {
          console.log('[sails-sqlserver find]: ', statement);
        }
        request.query(statement, function (err, recordset) {
          if (err) return cb(err);
          recordset = recordset.recordset; // mssql 4.x wraps in recordset
          if (!connections[connection].persistent) {
            mssqlConnect && mssqlConnect.close();
          }
          cb(null, recordset);
        });
      });
    },
    // Raw Query Interface
    query: function (connection, collection, query, data, cb) {
      if (_.isFunction(data)) {
        cb = data;
        data = null;
      }

      adapter.connectConnection(connection, function __FIND__(err, uniqId) {
        if (err) {
          console.error(err);
          return cb(err);
        }

        uniqId = uniqId || false;
        var mssqlConnect;
        if (!uniqId) {
          mssqlConnect = connections[connection].mssqlConnection;
        } else {
          mssqlConnect = connections[connection].mssqlConnection[uniqId];
        }

        var request = new mssql.Request(mssqlConnect);
        if (_.isArray(data)) {
          _.each(data, param => request.input(param.name, param.type, param.value));
        }

        request.query(query, function (err, recordset) {
          if (err) return cb(err);
          recordset = recordset.recordset; // mssql 4.x wraps in recordset
          if (connections[connection] && !connections[connection].persistent) {
            mssqlConnect && mssqlConnect.close();
          }
          if (!recordset) {
            recordset = [];
          }
          cb(null, recordset);
        });
      });
    },

    create: function (connection, collection, values, cb) {
      var identityInsert = false;
      var pk = adapter.getPrimaryKey(connection, collection);
      var pkType = adapter.getPrimaryKeyType(connection, collection);
      //console.log('pk=', pk);
      Object.keys(values).forEach(function (key) {
        values[key] = utils.prepareValue(values[key]);
        if (pk == key && pk == 'id' && pkType !== 'string') {
          identityInsert = true;
          //console.log(pk, '==', key);
        }
      });
      var schemaName = getSchemaName(connection, collection);
      var tableName = '[' + schemaName + ']' + '.[' + collection + ']';
      var statement = sql.insertQuery(tableName, values);
      if (identityInsert) {
        statement = 'SET IDENTITY_INSERT ' + tableName + ' ON; ' + statement + 'SET IDENTITY_INSERT ' + tableName + ' OFF;';
      }

      //console.log('create statement:', statement);

      adapter.connectConnection(connection, function __CREATE__(err, uniqId) {
        if (err) {
          console.error(err);
          return cb(err);
        }

        uniqId = uniqId || false;
        var mssqlConnect;
        if (!uniqId) {
          mssqlConnect = connections[connection].mssqlConnection;
        } else {
          mssqlConnect = connections[connection].mssqlConnection[uniqId];
        }

        var request = new mssql.Request(mssqlConnect);
        request.query(statement, handleCreateRecordsets);

        function handleCreateRecordsets(err, recordsets, alreadyRetried) {
          if (err) {
            if (
              !alreadyRetried &&
              err.message.match('IDENTITY_INSERT is set to OFF')
            ) {
              statement =
                'SET IDENTITY_INSERT ' +
                tableName +
                ' ON; ' +
                statement +
                'SET IDENTITY_INSERT ' +
                tableName +
                ' OFF;';
              return request.query(statement, handleCreateRecordsets, true);
            }
            console.error(err);
            return cb(err);
          }

          recordsets = recordsets.recordset; // mssql 4.x wraps in recordset
          var recordset = recordsets[0];
          var model = values;
          if (recordset.id) {
            model = _.extend({}, values, {
              id: recordset.id
            });
          }

          var _query = new Query(connections[connection].collections[collection].definition);
          var castValues = _query.cast(model);

          //console.log('castValues', castValues);
          if (!connections[connection].persistent) {
            mssqlConnect && mssqlConnect.close();
          }
          cb(err, castValues);
        }
      });
    },

    getPrimaryKey: function (connection, collection) {
      var pk = 'id';
      Object.keys(connections[connection].collections[collection].definition).forEach(function (key) {
        if (!connections[connection].collections[collection].definition[key].hasOwnProperty('primaryKey')) return;
        pk = key;
      });
      return pk;
    },

    getPrimaryKeyType: function (connection, collection) {
      var pkType = 'integer';
      Object.keys(connections[connection].collections[collection].definition).forEach(function (key) {
        if (!connections[connection].collections[collection].definition[key].hasOwnProperty('primaryKey')) return;
        pkType = connections[connection].collections[collection].attributes[key].type;
      });
      return pkType;
    },

    update: function (connection, collection, options, values, cb) {
      var isJunctionTable = connections[connection].collections[collection].meta && connections[connection].collections[collection].meta.junctionTable;
      var schemaName = getSchemaName(connection, collection);
      var tableName = '[' + schemaName + ']' + '.[' + collection + ']';

      var criteria = sql.serializeOptions(collection, options);

      var pk = adapter.getPrimaryKey(connection, collection);

      var statement = 'SELECT [' + pk + '] FROM' + tableName + ' ' + criteria;
      adapter.connectConnection(connection, function __UPDATE__(err, uniqId) {
        if (err) {
          console.error(err);
          return cb(err);
        }

        uniqId = uniqId || false;
        var mssqlConnect;
        if (!uniqId) {
          mssqlConnect = connections[connection].mssqlConnection;
        } else {
          mssqlConnect = connections[connection].mssqlConnection[uniqId];
        }

        var request = new mssql.Request(mssqlConnect);
        request.query(statement, function (err, recordset) {
          if (err) return cb(err);
          recordset = recordset.recordset; // mssql 4.x wraps in recordset
          //console.log('updating pks', recordset);
          if (_.isEmpty(recordset)) {
            return cb(null, []);
          }

          var pks = [];
          recordset.forEach(function (row) {
            pks.push(row[pk]);
          });

          var isValueNull = false;
          Object.keys(values).forEach(function (key) {
            values[key] = utils.prepareValue(values[key]);
            if (isJunctionTable && _.isNull(values[key])) {
              isValueNull = true;
            }
          });

          delete values[pk];

          var serializedOptions = ''
          // waterline is sending an update to join (junction) tables to null them. It should delete instead.
          // but be very careful...
          if (isJunctionTable && isValueNull && options.where) {
            statement = 'DELETE FROM ' + tableName + ' ';
            serializedOptions = sql.serializeOptions(collection, options);
            if (serializedOptions.toLowerCase().indexOf('where') < 0) {
              return cb(new Error('where clause is required during join table delete'));
            }
            statement += serializedOptions
          }
          else {
            statement = 'UPDATE ' + tableName + ' SET ' + sql.updateCriteria(collection, values) + ' ';
            serializedOptions = sql.serializeOptions(collection, options);
            statement += serializedOptions
          }

          request.query(statement, function (err, _recordset) {
            if (err) return cb(err);
            _recordset = _recordset.recordset; // mssql 4.x wraps in recordset

            var criteria;

            if (pks.length === 1) {
              criteria = {
                where: {},
                limit: 1
              };
              criteria.where[pk] = pks[0];
            } else {
              criteria = {
                where: {}
              };
              criteria.where[pk] = pks;
            }

            if (!connections[connection].persistent) {
              mssqlConnect && mssqlConnect.close();
            }
            return adapter.find(connection, collection, criteria, cb);
          });
        });
      });
    },

    destroy: function (connection, collection, options, cb) {
      var schemaName = getSchemaName(connection, collection);
      var tableName = '[' + schemaName + ']' + '.[' + collection + ']';
      var statement = 'DELETE FROM ' + tableName;
      statement += sql.serializeOptions(collection, options);
      adapter.connectConnection(connection, function __DELETE__(err, uniqId) {
        if (err) {
          console.error(err);
          return cb(err);
        }

        adapter.find(connection, collection, options, function (err, records) {
          if (err) return cb(err);

          uniqId = uniqId || false;
          var mssqlConnect;
          if (!uniqId) {
            mssqlConnect = connections[connection].mssqlConnection;
          } else {
            mssqlConnect = connections[connection].mssqlConnection[uniqId];
          }

          var request = new mssql.Request(mssqlConnect);
          request.query(statement, function (err, emptyDeleteRecordSet) {
            if (err) return cb(err);
            if (!connections[connection].persistent) {
              mssqlConnect && mssqlConnect.close();
            }
            cb(null, records);
          });
        });
      });
    },

    join: function (connectionName, collectionName, criteria, cb) {
      var nativeQuery = Promise.promisify(adapter.query);
      // console.log('criteria: ', JSON.stringify(criteria));
      var tableName = collectionName;

      var toManies = _.groupBy(_.filter(criteria.joins, { collection: true }), 'alias');
      var toOnes = _.groupBy(_.filter(criteria.joins, { model: true }), 'alias');
      var toManyNames = Object.keys(toManies);
      var toOneNames = Object.keys(toOnes);
      var selectParts = [];
      var whereParts = [];
      var joinParts = [];

      utils.convertDates({ attributes: connections[connectionName].collections[collectionName]._attributes, where: criteria.where });

      var mainAttrs = connections[connectionName].collections[collectionName]._attributes
      // criteria.select
      // console.log('attrs: ', JSON.stringify(mainAttrs));
      var localAttrNames = [];
      var attrsWeCareAbout = Object.keys(mainAttrs);
      if (criteria.select && (criteria.select !== '*')) {
        if (_.isArray(criteria.select)) {
          if (_.indexOf(criteria.select, '*') === -1) {
            attrsWeCareAbout = _.uniq(_.concat(criteria.select, toOneNames, toManyNames))
          }
        }
      }
      attrsWeCareAbout.forEach(function (attrName) {
        var isPopulation = false;
        var attr = mainAttrs[attrName];
        var toOne = toOnes[attrName];
        if (toOne) {
          isPopulation = true;
          toOne = toOne[0];
          var selectCriteria = toOne.select;
          if (toOne.criteria && toOne.criteria.select && (toOne.criteria.select !== '*')) {
            if (_.isArray(toOne.criteria.select)) {
              if (_.indexOf(toOne.criteria.select, '*') === -1) {
                selectCriteria = toOne.criteria.select
              }
            }
          }
          if (toOne.criteria && toOne.criteria.where && !_.isEmpty(toOne.criteria.where)) {
            whereParts.push(util.parseWherePhrase({ tableAs: toOne.alias, where: toOne.criteria.where }));
          }

          joinParts.push(`left outer join [${toOne.child}] as [${toOne.alias}] on [${toOne.alias}].[${toOne.childKey}] = [${toOne.parent}].[${toOne.parentKey}]`);
          if (selectCriteria) {
            // console.log('selectCriteria: ', selectCriteria)
            var childAttrs = connections[connectionName].collections[toOne.child]._attributes
            _.uniq(selectCriteria).forEach(function (selectItem) {
              var childAttr = childAttrs[selectItem] || _.find(childAttrs, { columnName: selectItem });
              if (!childAttr.hasOwnProperty('collection')) { // && !childAttr.hasOwnProperty('model')) {
                selectParts.push(`[${toOne.alias}].[${selectItem}] as [${toOne.alias}.${selectItem}]`)
              }
            })
          }
        }
        var toMany = toManies[attrName];
        if (toMany) {
          // console.log('------------toMany: ', toMany);
          isPopulation = true;
          var fromClause;
          var whereClause;
          var whereFromCriteriaClause = '';
          if (toMany.length === 1) {
            toMany = toMany[0];

            fromClause = `from [${toMany.child}] WITH (NOLOCK)`;
            if (toMany.criteria && toMany.criteria.where && !_.isEmpty(toMany.criteria.where)) {
              whereFromCriteriaClause = `AND ${util.parseWherePhrase({ tableAs: toMany.child, where: toMany.criteria.where })}`;
            }
            whereClause = `where [${toMany.child}].[${toMany.childKey}] = [${toMany.parent}].[${toMany.parentKey}] ${whereFromCriteriaClause}`;
          }
          else { // manytoManies
            //          toMany
            // combine the two tables into a single select subquery
            // console.log(toMany);
            var joinedTable = _.find(toMany, { junctionTable: true });
            var joinTable = _.find(toMany, { child: joinedTable.parent });
            toMany = joinedTable;
            // var fromClause = `from [${toMany.child}]`;
            fromClause = `from [${joinTable.child}] WITH (NOLOCK) join [${joinedTable.child}] WITH (NOLOCK) on [${joinedTable.parent}].[${joinedTable.parentKey}] = [${joinedTable.child}].[${joinedTable.childKey}]`;

            if (toMany.criteria && toMany.criteria.where && !_.isEmpty(toMany.criteria.where)) {
              whereFromCriteriaClause = `AND ${util.parseWherePhrase({ tableAs: joinedTable.child, where: toMany.criteria.where })}`;
            }
            whereClause = `where [${joinTable.child}].[${joinTable.childKey}] = [${joinTable.parent}].[${joinTable.parentKey}] ${whereFromCriteriaClause}`;
            // console.log(`(select ??? ${fromClause} ${whereClause} FOR JSON PATH) as ${toMany.alias}`)
          }

          var toManySubSelectParts = [];
          var selectCriteria = toMany.select;
          // if (toMany.select) {
          if (toMany.criteria && toMany.criteria.select && (toMany.criteria.select !== '*')) {
            if (_.isArray(toMany.criteria.select)) {
              if (_.indexOf(toMany.criteria.select, '*') === -1) {
                selectCriteria = toMany.criteria.select
              }
            }
          }
          // console.log('toMany.select: ', toMany.select)
          var childAttrs = connections[connectionName].collections[toMany.child]._attributes
          _.uniq(selectCriteria).forEach(function (selectItem) {
            var childAttr;
            var childAttrKey;
            if (childAttrs[selectItem]) {
              childAttr = childAttrs[selectItem];
              childAttrKey = selectItem;
            }
            else {
              childAttr = _.find(childAttrs, { columnName: selectItem });
              childAttrKey = _.findKey(childAttrs, { columnName: selectItem });
            }
            if (!childAttr.hasOwnProperty('collection')) {
              toManySubSelectParts.push(`[${toMany.child}].[${selectItem}] as [${childAttrKey}]`)
            }
          })
          // }
          var toManySubSelect = toManySubSelectParts.join(', ');

          var limitClause = '';
          var skipClause = '';
          var orderByClause = util.parseOrderByPhrase({ tableAs: toMany.child, sort: toMany.criteria.sort });
          if (toMany.criteria.limit) {
            limitClause = `TOP ${toMany.criteria.limit}`
          }
          var subQueryAsString = '';
          if (toMany.criteria.skip) {
            skipClause = toMany.criteria.skip
            if (!orderByClause) {
              var primaryKey = connections[connectionName].collections[toMany.child].getPrimaryKey();
              orderByClause = util.parseOrderByPhrase({ tableAs: toMany.child, sort: { [primaryKey]: 1 } })
            }
            subQueryAsString = `
            SELECT ${limitClause} * FROM (
              SELECT ROW_NUMBER() OVER(${orderByClause}) as row#,
              ${toManySubSelect}
              ${fromClause}
              ${whereClause}
            ) as completeDataSet
            where row# > ${skipClause}
            FOR JSON PATH
            `
          }
          else {
            subQueryAsString = `
            SELECT ${limitClause}
            ${toManySubSelect}
            ${fromClause}
            ${whereClause}
            ${orderByClause}
            FOR JSON PATH
            `;
          }
          selectParts.push(`(${subQueryAsString}) as ${toMany.alias}`)
        }
        if (!isPopulation && !attr.hasOwnProperty('collection')) {
          // if (!attr.hasOwnProperty('collection') && !attr.hasOwnProperty('model')) {
          if (attr.hasOwnProperty('columnName')) {
            selectParts.push(`[${tableName}].[${attr.columnName}]`)
          }
          else {
            selectParts.push(`[${tableName}].[${attrName}]`)
          }
        }
      })

      var selectClause = selectParts.join(', ');
      var joinClause = joinParts.join(' ');;
      var whereClause = '';

      if (criteria.where) {
        whereParts.unshift(util.parseWherePhrase({ tableAs: collectionName, where: criteria.where }));
      }
      if (whereParts.length) {
        whereClause = `WHERE ${whereParts.join(' AND ')}`;
      }
      // console.log('where: ', whereClause);
      // one to manies and many to manies will take sub query (selects)
      // one to one will use join
      var limitClause = '';
      var skipClause = '';
      var orderByClause = util.parseOrderByPhrase({ tableAs: tableName, sort: criteria.sort });
      if (criteria.limit) {
        limitClause = `TOP ${criteria.limit}`
      }
      var queryAsString = '';
      if (criteria.skip) {
        skipClause = criteria.skip
        if (!orderByClause) {
          var primaryKey = connections[connectionName].collections[collectionName].getPrimaryKey();
          orderByClause = util.parseOrderByPhrase({ tableAs: tableName, sort: { [primaryKey]: 1 } })
        }
        queryAsString = `
        SELECT ${limitClause} * FROM (
          SELECT ROW_NUMBER() OVER(${orderByClause}) as row#,
          ${selectClause}
          FROM [${tableName}] WITH (NOLOCK) ${joinClause} ${whereClause}
        ) as completeDataSet
        where row# > ${skipClause}
        FOR JSON PATH
        `
      }
      else {
        queryAsString = `
        SELECT ${limitClause}
          ${selectClause}
          FROM [${tableName}] WITH (NOLOCK)
          ${joinClause}
          ${whereClause}
          ${orderByClause}
          FOR JSON PATH
        `;
      }
      // var queryAsString = `SELECT ${limitClause} ${selectClause} FROM ${tableName} ${joinClause} ${whereClause} ${orderByClause} FOR JSON PATH`;
      // console.log('query: ', queryAsString);
      nativeQuery(connectionName, null, queryAsString)
        .then(function (results) {
          // console.log('results: ', results);
          var parsedResults;
          try {
            // rip off the JSON_{GUID} from the results of a FOR JSON call
            var jsonString = results[0][Object.keys(results[0])[0]];
            // console.log('jsonString', jsonString);
            if (!jsonString) {
              return cb(null, jsonString);
            }
            parsedResults = JSON.parse(jsonString);
            return cb(null, parsedResults);
          }
          catch (error) {
            console.error('unparsable results: ', results);
            console.error('error parsing: ', error);
            return cb(error);
          }

        })
        .catch(function (error) {
          console.log('join badness in the adapter: ', error);
          cb(error);
        });


    }
  };

  function marshalConfig(_config) {
    var config = _.defaults(_config, {
      server: _config.host,
      pool: {
        max: _config.pool.max,
        min: _config.pool.min,
        idleTimeoutMillis: _config.pool.idleTimeout * 1000
      }
    });

    return config;
  }

  function getSchemaName(connection, collection) {
    var collectionObject = connections[connection].collections[collection];
    return collectionObject.meta && collectionObject.meta.schemaName ? collectionObject.meta.schemaName : 'dbo';
  }

  return adapter;
})();
