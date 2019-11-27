var _ = require('lodash');
var Query = require('./query');
var sql = require('./sql.js');
var utils = require('./utils');
var Promise = require('bluebird');

var mssqlDriver = require('machinepack-mssql');

var moment = require("moment");



var registeredDatastores = {};
let awaitableCreate;
// TODO: Not the same as utils (which is stored in a separate file. need to refactor to same one.)
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
      var leftHandSide = keys[0];
      var rightHandSide = waterlineWhere[keys[0]];
      if (leftHandSide === 'or' && _.isArray(rightHandSide)) {
        return `((${rightHandSide.map(function (item) { return util.parseWherePhrase({ tableAs, where: item }) }).join(') OR (')}))`;
      }
      if (leftHandSide === 'and' && _.isArray(rightHandSide)) {
        return `((${rightHandSide.map(function (item) { return util.parseWherePhrase({ tableAs, where: item }) }).join(') AND (')}))`;
      }
      if (_.isObject(rightHandSide)) {
        if (_.isArray(rightHandSide) || _.has(rightHandSide, 'in')) {

          if (_.has(rightHandSide, 'in')) {
            rightHandSide = _.cloneDeep(rightHandSide.in);
          }


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
    if (!sort || (_.isArray(sort) && !sort.length)) {
      return '';
    }
    var orderParts = [];
    _.each(sort, function (sortItem) {
      _.each(sortItem, function (direction, attributeName) {
        orderParts.push(`[${tableAs}].[${attributeName}] ${(direction === 1 || direction === 'ASC') ? 'ASC' : 'DESC'}`)
      })
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
  identity: 'sails-mssql',
  adapterApiVersion: 1,
  util,
  syncable: true,

  // Default configuration for registeredDatastores
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
  datastores: registeredDatastores,


  registerDatastore: async function (datastoreConfig, physicalModelsReport, done) {

    // Grab the unique name for this datastore for easy access below.
    var datastoreName = datastoreConfig.identity;

    // Some sanity checks:
    if (!datastoreName) {
      return done(new Error('Consistency violation: A datastore should contain an "identity" property: a special identifier that uniquely identifies it across this app.  This should have been provided by Waterline core!  If you are seeing this message, there could be a bug in Waterline, or the datastore could have become corrupted by userland code, or other code in this adapter.  If you determine that this is a Waterline bug, please report this at https://sailsjs.com/bugs.'));
    }
    if (registeredDatastores[datastoreName]) {
      return done(new Error('Consistency violation: Cannot register datastore: `' + datastoreName + '`, because it is already registered with this adapter!  This could be due to an unexpected race condition in userland code (e.g. attempting to initialize Waterline more than once), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    if (!datastoreConfig.url) {
      return done(new Error('Invalid configuration for datastore `' + datastoreName + '`:  Missing `url` (See https://sailsjs.com/config/datastores#?the-connection-url for more info.)'));
    }

    /*
      protocol://user:password@host:port/database

      mysql://  root  :  squ1ddy   @  localhost  :  3306  /  my_dev_db_name
      |         |        |            |             |        |
      |         |        |            |             |        |
      protocol  user     password     host          port     database
    */

    var urlMatches = datastoreConfig.url.match(/^mssql:\/\/([^:]+):([^@]+)@([^/:]+)(?::([^:]+))?\/([^/]+)$/);
    if (!urlMatches) {
      return done(new Error('Invalid configuration for datastore `' + datastoreName + '`:  `url` definition does not follow the pattern'));
    }

    // const user = urlMatches[1];
    // const password = urlMatches[2];
    // const host = urlMatches[3];
    // const port = urlMatches[4] && Number(urlMatches[4]);
    // const database = urlMatches[5];

    // _.extend(datastoreConfig, { user, password, host, port, database });
    registeredDatastores[datastoreName] = {
      config: datastoreConfig,
      manager: (await mssqlDriver.createManager({ connectionString: datastoreConfig.url, meta: datastoreConfig })).manager,
      driver: mssqlDriver,
    };

    var dbSchema = {};

    _.each(physicalModelsReport, function buildSchema(val) {
      var identity = val.identity;
      var tableName = val.tableName;
      var definition = val.definition;

      dbSchema[tableName] = {
        identity: identity,
        tableName: tableName,
        definition: definition,
        attributes: definition,
        primaryKey: val.primaryKey
      };
    });

    // Store the db schema for the connection
    // definitions[datastoreName] = dbSchema;
    registeredDatastores[datastoreName].dbSchema = dbSchema;
    done();
  },

  /**
   * Fired when a model is unregistered, typically when the server
   * is killed. Useful for tearing-down remaining open registeredDatastores,
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
      _.each(registeredDatastores, function (c) {
        if (c.persistent) {
          c.mssqlConnection && c.mssqlConnection.close();
        } else {
          _.each(c.mssqlConnection, function (handle) {
            handle && handle.close();
          });
        }
      });
      registeredDatastores = {};
      return cb();
    }
    if (!registeredDatastores[conn]) return cb();

    if (registeredDatastores[conn].persistent) {
      registeredDatastores[conn].mssqlConnection.close();
    } else {
      _.each(registeredDatastores[conn], function (handle) {
        handle.mssqlConnection && handle.mssqlConnection.close();
      });
    }
    delete registeredDatastores[conn];

    cb();
  },


  /**
   *
   * REQUIRED method if integrating with a schemaful
   * (SQL-ish) database.
   *
   */
  define: async function (datastoreName, tableName, definition, cb) {

    var dsEntry = registeredDatastores[datastoreName];

    // Sanity check:
    if (_.isUndefined(dsEntry)) {
      return done(new Error('Consistency violation: Cannot do that with datastore (`' + datastoreName + '`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    var schema = sql.schema(tableName, definition);
    var schemaName = getSchemaName(datastoreName, tableName);
    tableName = '[' + schemaName + ']' + '.[' + tableName + ']';
    var statement = 'CREATE TABLE ' + tableName + ' (' + schema + ')';

    try {
      await adapter.connectAndQuery({ query: statement, datastoreName });
      return cb(null, {});
    } catch (error) {
      return cb(error);
    }

  },

  /**
   *
   * REQUIRED method if integrating with a schemaful
   * (SQL-ish) database.
   *
   */
  drop: async function (datastoreName, tableName, unused, cb) {
    var dsEntry = registeredDatastores[datastoreName];
    if (_.isUndefined(dsEntry)) {
      return cb(new Error('Consistency violation: Cannot do that with datastore (`' + datastoreName + '`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at https://sailsjs.com/support.)'));
    }

    // Add in logic here to delete a collection (e.g. DROP TABLE logic)
    var schemaName = getSchemaName(datastoreName, tableName);
    var tableName = '[' + schemaName + ']' + '.[' + tableName + ']';
    var statement =
      "IF OBJECT_ID('" +
      tableName +
      "', 'U') IS NOT NULL DROP TABLE " +
      tableName;

    try {
      await adapter.connectAndQuery({ query: statement, datastoreName });
      return cb(null, {});
    } catch (error) {
      return cb(error);
    }
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
  count: async function (datastoreName, query, cb) {
    try {

      let tableName = query.using;
      const criteria = _.cloneDeep(query.criteria);
      var dsEntry = registeredDatastores[datastoreName];

      utils.convertDates({ attributes: dsEntry.dbSchema[tableName].attributes, where: criteria.where });

      criteria.__primaryKey__ = adapter.getPrimaryKeyColumnName(datastoreName, tableName);
      var schemaName = getSchemaName(datastoreName, tableName);
      const wrappedTableName = '[' + schemaName + ']' + '.[' + tableName + ']';
      // var statement = sql.selectQuery(wrappedTableName, criteria);
      let statement = `SELECT COUNT(*) as countOfRows FROM ${wrappedTableName} `;
      statement += sql.serializeOptions(wrappedTableName, criteria);

      let recordset = await adapter.connectAndQuery({ query: statement, datastoreName, meta: query.meta });
      return cb(null, recordset[0].countOfRows);
    }
    catch (error) {
      cb(error);
    }
  },


  createEach: async function (datastoreName, query, done) {
    const { newRecords, meta } = query;
    // todo: make this way faster by doing a set based insert
    try {

      const results = await Promise.mapSeries(newRecords, (newRecord) => {
        const newRecordQuery = _.cloneDeep(query);
        newRecordQuery.newRecord = newRecord;
        return awaitableCreate(datastoreName, newRecordQuery);
      })
      if (!meta || !meta.fetch) {
        return done();
      }

      // todo: add support for query.meta.fetch
      done(null, results);
    }
    catch (e) {
      done(e);
    }
  },

  create: async function (datastoreName, { newRecord, using: tableName, meta, method }, cb) {
    try {

      var pk = adapter.getPrimaryKeyColumnName(datastoreName, tableName);

      if (_.isNull(newRecord[pk])) {
        delete newRecord[pk];
      }

      Object.keys(newRecord).forEach(function (key) {
        newRecord[key] = utils.prepareValue(newRecord[key]);
        if (pk == key && pk == 'id') {
        }
      });
      var schemaName = getSchemaName(datastoreName, tableName);
      const wrappedTableName = '[' + schemaName + ']' + '.[' + tableName + ']';
      var statement = sql.insertQuery(wrappedTableName, newRecord);
      let results
      try {
        results = await adapter.connectAndQuery({ query: statement, datastoreName, meta });
      }
      catch (error) {
        if (error.message.match('IDENTITY_INSERT is set to OFF')) {
          statement =
            'SET IDENTITY_INSERT ' +
            wrappedTableName +
            ' ON; ' +
            statement +
            'SET IDENTITY_INSERT ' +
            wrappedTableName +
            ' OFF;';
          results = await adapter.connectAndQuery({ query: statement, datastoreName, meta });
        }
        else {
          throw error;
        }
      }

      if (!meta || !meta.fetch) {
        return cb();
      }
      var model = newRecord;
      if (results[0] && results[0].id) {
        model = _.extend({}, newRecord, {
          id: results[0].id
        });
      }

      var _query = new Query(registeredDatastores[datastoreName].dbSchema[tableName].attributes);
      var castValues = _query.cast(model);

      cb(null, castValues);
    }
    catch (error) {
      cb(error);
    }
  },

  getPrimaryKeyColumnName: function (datastoreName, tableName) {
    if (!registeredDatastores[datastoreName].dbSchema[tableName]) {
      console.log('something wrong here.');
    }
    const tableSchema = registeredDatastores[datastoreName].dbSchema[tableName]
    const primaryKeyName = tableSchema.primaryKey || 'id';
    return tableSchema.definition[primaryKeyName].columnName;
  },

  update: async function (datastoreName, query = {}, cb) {
    try {

      const { valuesToSet: values, using: tableName, meta } = query;
      var isJunctionTable = registeredDatastores[datastoreName].dbSchema[tableName].meta && registeredDatastores[datastoreName].dbSchema[tableName].meta.junctionTable;
      var schemaName = getSchemaName(datastoreName, tableName);
      var wrappedTableName = '[' + schemaName + ']' + '.[' + tableName + ']';

      var criteria = sql.serializeOptions(tableName, query.criteria);

      var pk = adapter.getPrimaryKeyColumnName(datastoreName, tableName);

      var statement = 'SELECT [' + pk + '] FROM' + wrappedTableName + ' ' + criteria;

      let recordset = await adapter.connectAndQuery({ query: statement, datastoreName, meta: query.meta });

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

      // delete values[pk];

      var serializedOptions = ''
      // waterline is sending an update to join (junction) tables to null them. It should delete instead.
      // but be very careful...
      if (isJunctionTable && isValueNull && query.criteria.where) {
        statement = 'DELETE FROM ' + wrappedTableName + ' ';
        serializedOptions = sql.serializeOptions(tableName, query.criteria);
        if (serializedOptions.toLowerCase().indexOf('where') < 0) {
          return cb(new Error('where clause is required during join table delete'));
        }
        statement += serializedOptions
      }
      else {
        statement = 'UPDATE ' + wrappedTableName + ' SET ' + sql.updateCriteria(tableName, values) + ' ';
        serializedOptions = sql.serializeOptions(tableName, query.criteria);
        statement += serializedOptions
      }


      await adapter.connectAndQuery({ query: statement, datastoreName, meta: query.meta });

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

      return adapter.find(datastoreName, { using: tableName, criteria }, cb);
    } catch (error) {
      cb(error);
    }
  },

  destroy: async function (datastoreName, query = {}, cb) {
    let { using: tableName, meta } = query;
    var schemaName = getSchemaName(datastoreName, tableName);
    tableName = '[' + schemaName + ']' + '.[' + tableName + ']';
    var statement = 'DELETE FROM ' + tableName + ' ';
    statement += sql.serializeOptions(tableName, query.criteria);
    // if (meta && meta.fetch) {
    let records;
    if (meta && meta.fetch) {
      records = await adapter.find(datastoreName, query);
    }

    await adapter.connectAndQuery({ query: statement, datastoreName, meta: query.meta });
    if (!meta || !meta.fetch) {
      return cb();
    }

    cb(null, records);
  },
  connectAndQuery: async function ({ query, datastoreName, meta = {} } = {}) {
    // check for leasedConnection which happens during a transaction
    let connection = meta.leasedConnection
    if (!connection) {
      connection = (await registeredDatastores[datastoreName].driver.getConnection({
        manager: registeredDatastores[datastoreName].manager,
      })).connection;
    }
    const report = await registeredDatastores[datastoreName].driver.sendNativeQuery({
      connection: connection,
      nativeQuery: query
    });
    return report.result.recordsets[0];
  },
  find: async function (datastoreName, query, cb) {
    try {

      let tableName = query.using;
      const criteria = _.cloneDeep(query.criteria);
      var dsEntry = registeredDatastores[datastoreName];

      // Check if this is an aggregate query and that there is something to return
      if (criteria.groupBy || criteria.sum || criteria.average || criteria.min || criteria.max) {
        if (!criteria.sum && !criteria.average && !criteria.min && !criteria.max) {
          return cb(new Error('Cannot groupBy without a calculation'));
        }
      }

      utils.convertDates({ attributes: dsEntry.dbSchema[tableName].attributes, where: criteria.where });

      criteria.__primaryKey__ = adapter.getPrimaryKeyColumnName(datastoreName, tableName);
      var schemaName = getSchemaName(datastoreName, tableName);
      const wrappedTableName = '[' + schemaName + ']' + '.[' + tableName + ']';
      var statement = sql.selectQuery(wrappedTableName, criteria);


      let recordset = await adapter.connectAndQuery({ query: statement, datastoreName, meta: query.meta });
      recordset = normalizeResults(datastoreName, tableName, recordset);
      if (typeof cb === 'function') {
        return cb(null, recordset);
      }
      return recordset;
    }
    catch (error) {
      cb(error);
    }
  },
  avg: async function (datastoreName, query, cb) {
    try {
      let tableName = query.using;
      const criteria = _.cloneDeep(query.criteria);
      var dsEntry = registeredDatastores[datastoreName];

      utils.convertDates({ attributes: dsEntry.dbSchema[tableName].attributes, where: criteria.where });

      criteria.__primaryKey__ = adapter.getPrimaryKeyColumnName(datastoreName, tableName);
      var schemaName = getSchemaName(datastoreName, tableName);
      const wrappedTableName = '[' + schemaName + ']' + '.[' + tableName + ']';
      // var statement = sql.selectQuery(wrappedTableName, criteria);
      let statement = `SELECT AVG(cast ([${query.numericAttrName}] as float)) as averageValue FROM ${wrappedTableName} `;
      statement += sql.serializeOptions(wrappedTableName, criteria);


      let recordset = await adapter.connectAndQuery({ query: statement, datastoreName, meta: query.meta });
      return cb(null, recordset[0].averageValue);
    }
    catch (error) {
      cb(error);
    }
  },
  sum: async function (datastoreName, query, cb) {
    try {
      let tableName = query.using;
      const criteria = _.cloneDeep(query.criteria);
      var dsEntry = registeredDatastores[datastoreName];

      utils.convertDates({ attributes: dsEntry.dbSchema[tableName].attributes, where: criteria.where });

      criteria.__primaryKey__ = adapter.getPrimaryKeyColumnName(datastoreName, tableName);
      var schemaName = getSchemaName(datastoreName, tableName);
      const wrappedTableName = '[' + schemaName + ']' + '.[' + tableName + ']';
      // var statement = sql.selectQuery(wrappedTableName, criteria);
      let statement = `SELECT SUM([${query.numericAttrName}]) as sumValue FROM ${wrappedTableName} `;
      statement += sql.serializeOptions(wrappedTableName, criteria);

      let recordset = await adapter.connectAndQuery({ query: statement, datastoreName, meta: query.meta });
      return cb(null, recordset[0].sumValue);
    }
    catch (error) {
      cb(error);
    }
  },

  join: async function (datastoreName, query, cb) {
    try {

      // if sql server old version
      if (!registeredDatastores[datastoreName].manager.version) {
        const connection = (await registeredDatastores[datastoreName].driver.getConnection({
          manager: registeredDatastores[datastoreName].manager,
        })).connection;
        const report = await registeredDatastores[datastoreName].driver.sendNativeQuery({
          connection: connection,
          nativeQuery: 'select serverproperty(\'productversion\')'
        });
        registeredDatastores[datastoreName].manager.version = Number(Object.values(report.result.recordsets[0][0])[0].split('.')[0])
      }
      // get sql server edition
      if (!registeredDatastores[datastoreName].manager.edition) {
        const connection = (await registeredDatastores[datastoreName].driver.getConnection({
          manager: registeredDatastores[datastoreName].manager,
        })).connection;
        const report = await registeredDatastores[datastoreName].driver.sendNativeQuery({
          connection: connection,
          nativeQuery: 'select serverproperty(\'Edition\')'
        });
        registeredDatastores[datastoreName].manager.edition = String(Object.values(report.result.recordsets[0][0])[0])
      }
      // if sql 2014 or lower, and not SQL Azure, FOR JSON not supported, so run old join code
      if (registeredDatastores[datastoreName].manager.version < 13 && registeredDatastores[datastoreName].manager.edition !== "SQL Azure") {
        return adapter.oldJoin(datastoreName, query, cb);
      }

      let tableName = query.using;
      const criteria = _.cloneDeep(query.criteria);


      var toManies = _.groupBy(_.filter(query.joins, { collection: true }), 'alias');
      var toOnes = _.groupBy(_.filter(query.joins, { model: true }), 'alias');
      var toManyNames = Object.keys(toManies);
      var toOneNames = Object.keys(toOnes);
      var selectParts = [];
      var whereParts = [];
      var joinParts = [];

      utils.convertDates({ attributes: registeredDatastores[datastoreName].dbSchema[tableName].attributes, where: criteria.where });

      var mainAttrs = registeredDatastores[datastoreName].dbSchema[tableName].attributes
      var attrsWeCareAbout = Object.keys(mainAttrs);
      if (criteria.select && (criteria.select !== '*')) {
        if (_.isArray(criteria.select)) {
          if (_.indexOf(criteria.select, '*') === -1) {
            attrsWeCareAbout = _.concat(criteria.select, toOneNames, toManyNames);
            attrsWeCareAbout = _.uniq(attrsWeCareAbout);
          }
        }
      }
      attrsWeCareAbout.forEach(function (attrName) {
        var isPopulation = false;
        // var attr = mainAttrs[attrName];
        var attr = _.find(mainAttrs, { columnName: attrName });
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
            whereParts.push(util.parseWherePhrase({ tableAs: toOne.parentKey, where: toOne.criteria.where }));
          }

          joinParts.push(`left outer join [${toOne.child}] as [${toOne.parentKey}] on [${toOne.parentKey}].[${toOne.childKey}] = [${toOne.parent}].[${toOne.parentKey}]`);
          if (selectCriteria) {
            // console.log('selectCriteria: ', selectCriteria)
            var childAttrs = registeredDatastores[datastoreName].dbSchema[toOne.child].attributes
            _.uniq(selectCriteria).forEach(function (selectItem) {
              var childAttr = childAttrs[selectItem] || _.find(childAttrs, { columnName: selectItem });
              if (!childAttr.hasOwnProperty('collection')) { // && !childAttr.hasOwnProperty('model')) {
                selectParts.push(`[${toOne.parentKey}].[${selectItem}] as [${toOne.parentKey}.${selectItem}]`)
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
          var childAttrs = registeredDatastores[datastoreName].dbSchema[toMany.child].attributes
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
              // toManySubSelectParts.push(`[${toMany.child}].[${selectItem}] as [${childAttrKey}]`)
              toManySubSelectParts.push(`[${toMany.child}].[${selectItem}]`)
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
              // var primaryKey = registeredDatastores[datastoreName].dbSchema[toMany.child].getPrimaryKey();
              var primaryKey = adapter.getPrimaryKeyColumnName(datastoreName, toMany.child);

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
            FOR JSON PATH, INCLUDE_NULL_VALUES
            `
          }
          else {
            subQueryAsString = `
            SELECT ${limitClause}
            ${toManySubSelect}
            ${fromClause}
            ${whereClause}
            ${orderByClause}
            FOR JSON PATH, INCLUDE_NULL_VALUES
            `;
          }
          selectParts.push(`(${subQueryAsString}) as ${toMany.alias}`)
          // selectParts.push(`(${subQueryAsString}) as ${toMany.parentKey}`)
        }
        if (!isPopulation && !attr.hasOwnProperty('collection')) {
          // if (!attr.hasOwnProperty('collection') && !attr.hasOwnProperty('model')) {
          // if (attr.hasOwnProperty('columnName')) {
          const thisIsJoin = _.find(query.joins, { parentKey: attr.columnName });
          if (!thisIsJoin || !thisIsJoin.removeParentKey) {
            selectParts.push(`[${tableName}].[${attr.columnName}]`)
          }
          // }
          // else {
          //   selectParts.push(`[${tableName}].[${attrName}]`)
          // }
        }
      })

      var selectClause = selectParts.join(', ');
      var joinClause = joinParts.join(' ');;
      var whereClause = '';


      // if (!(_.isEmpty(options.where)) && _.isObject(options.where)) {

      if (criteria.where && !(_.isEmpty(criteria.where)) && _.isObject(criteria.where)) {
        whereParts.unshift(util.parseWherePhrase({ tableAs: tableName, where: criteria.where }));
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
          // var primaryKey = registeredDatastores[datastoreName].dbSchema[tableName].getPrimaryKey();
          var primaryKey = adapter.getPrimaryKeyColumnName(datastoreName, tableName);

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

      try {
        let results = await adapter.connectAndQuery({ query: queryAsString, datastoreName, meta: query.meta });
        // recordset = normalizeResults(datastoreName, tableName, recordset);
        // if (typeof cb === 'function') {
        //   return cb(null, recordset);
        // }
        // return recordset;


        // return nativeQuery(datastoreName, queryAsString)
        // .then(function (results) {
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

        }
        catch (error) {
          console.error('unparsable results: ', results);
          console.error('error parsing: ', error);
          return cb(error);
        }


        // make sure all populates are null if undefined
        _.each(parsedResults, (parsedResult) => {
          _.each(query.joins, (join) => {
            if (join.collection === true) { // toMany association
              // const isManyThrough = (_.filter(query.joins, { alias: join.alias }).length > 1);
              // if (isManyThrough && !join.junctionTable) {// if there are two joins with the same alias, we want the junctionTable
              if (join.select === false) {
                return
              }
              if (!parsedResult.hasOwnProperty(join.alias)) {
                return parsedResult[join.alias] = [];
              }
              else { // should we normalize these? I think they may already be normalized...
                return parsedResult[join.alias] = normalizeResults(datastoreName, join.child, parsedResult[join.alias]);
              }
            }
            if (typeof parsedResult[join.parentKey] === 'undefined') {
              return parsedResult[join.parentKey] = null;
            }
            else {
              return parsedResult[join.parentKey] = normalizeResults(datastoreName, join.child, parsedResult[join.parentKey]);
            }
          })
        })

        parsedResults = normalizeResults(datastoreName, tableName, parsedResults);

        return cb(null, parsedResults);

        // })
        // .catch(function (error) {
        //   console.log('join (populate) failed in the adapter: ', error);
        //   cb(error);
        // });
      }
      catch (error) {
        console.log('join (populate) failed in the adapter: ', error);
        cb(error);
      }
    }
    catch (error) {
      cb(error);
    }
  },

  // SQL Server versions older than 2016 can't use FOR JSON, so fall back to UNIONs
  oldJoin: async function (datastoreName, wlQuery, cb) {

    let tableName = wlQuery.using;
    const criteria = _.cloneDeep(wlQuery.criteria);

    _.each(wlQuery.joins, function (joinItem) {
      if (joinItem.criteria && joinItem.criteria.where) {

        addTableToKey(joinItem.criteria.where);

        function addTableToKey(wherePortion) {
          _.forOwn(wherePortion, function (value, key) {
            if (['and', 'or'].indexOf(key.toLowerCase()) > -1) {
              return _.each(value, addTableToKey);
            }
            wherePortion[joinItem.child + '].[' + key] = value;
            delete wherePortion[key];
          });

        }
      }
    });

    if (wlQuery.joins) {
      var joins = wlQuery.joins;
      var junctionJoins = _.filter(joins, {
        junctionTable: true
      });
      _.each(junctionJoins, function (junctionJoin) {
        var middleJoin = _.find(joins, {
          child: junctionJoin.parent
        });
        middleJoin.middleLeft = middleJoin.child;
        middleJoin.middleLeftKey = middleJoin.childKey;
        middleJoin.middleRight = junctionJoin.parent;
        middleJoin.middleRightKey = junctionJoin.parentKey;
        delete junctionJoin.parent;
        delete junctionJoin.parentKey;
        _.merge(middleJoin, junctionJoin);
        junctionJoin.__DELETE_ME__ = true;
      });
      _.remove(joins, {
        __DELETE_ME__: true
      });
      delete wlQuery.joins;
    }
    var promises = {};

    promises[tableName] = adapter.find(datastoreName, { using: tableName, criteria });

    promises[tableName]
      .then(function (topLevelResults) {
        return Promise.all(
          _.map(joins, function (join) {
            promises[join.child] = promises[join.parent].then(async function (
              parentResults
            ) {
              // var connectionObject = connections[datastoreName];
              // var collection = connectionObject.collections[join.child];
              // var primaryKey = collection.getPrimaryKey();
              var attributes = registeredDatastores[datastoreName].dbSchema[join.child].attributes
              var aliasForColumnName = {};
              _.each(attributes, (attribute, attributeAlias) => {
                if (attribute.columnName) {
                  aliasForColumnName[attribute.columnName] = attributeAlias
                }
              })
              var primaryKey = adapter.getPrimaryKeyColumnName(datastoreName, join.child);

              var schemaName = getSchemaName(datastoreName, join.child);
              var tableNameWithSchema = '[' + schemaName + ']' + '.[' + join.child + ']';
              var orderBy = '';
              var sqlQueryParts = _.map(parentResults, function (parentResult) {
                var criteria = _.clone(join.criteria || {
                  where: {}
                });
                criteria.where = criteria.where || {};
                criteria.limit = criteria.limit || '100 percent';
                if (criteria.sort) {
                  orderBy = sql.serializeOptions(join.child, {
                    sort: criteria.sort
                  });
                  if (!criteria.skip) {
                    delete criteria.sort;
                  }
                }
                if (!join.junctionTable) {
                  criteria.where[join.childKey] = parentResult[join.parentKey];
                } else {
                  criteria.where[join.middleLeftKey] = parentResult[join.parentKey];
                }
                if (criteria.select && criteria.select.length) {
                  criteria.select = _.uniq(criteria.select);
                }
                criteria.__primaryKey__ = primaryKey;
                if (join.junctionTable) {
                  // remove "manies" from select
                  if (join.select && join.select.length) {
                    _.each(join.select, function (selectItem) {
                      // if (collection._attributes[selectItem] && ('collection' in collection._attributes[selectItem])) {
                      if (attributes[selectItem] && ('collection' in attributes[selectItem])) {
                        // selectItem is a xToMany
                        join.select = _.omit(join.select, selectItem)
                      }
                    })
                  }
                  criteria.joinMeta = join;
                }
                var generatedSelectQuery = sql.selectQuery(tableNameWithSchema, criteria);
                if (criteria.skip) {
                  return generatedSelectQuery.replace(/ORDER BY(?!.*\)).*$/, '')
                }
                return generatedSelectQuery;
              });
              var sqlQuery = sqlQueryParts.join(' UNION ') + ' ' + orderBy;


              let childResults = await adapter.connectAndQuery({ query: sqlQuery, datastoreName, meta: wlQuery.meta });


              // return nativeQuery(datastoreName, sqlQuery).then(
              // function (childResults) {
              let preserveColumns;
              if (join.middleLeftKey) {
                preserveColumns = [join.middleLeftKey];
              }
              childResults = normalizeResults(datastoreName, join.child, childResults, { preserveColumns })
              childResults.forEach((childResult) => {
                _.each(attributes, (attribute, attributeAlias) => {
                  if (attribute.columnName && childResult.hasOwnProperty(attribute.columnName)) {
                    if (attributeAlias !== attribute.columnName) {
                      // todo: handle case where we have an alias that matches one of the columnNames on another property
                      childResult[attributeAlias] = childResult[attribute.columnName];
                      delete childResult[attribute.columnName];
                    }
                  }
                })
              })
              var groupedResults;
              groupedResults = _.groupBy(
                childResults,
                join.middleLeftKey || aliasForColumnName[join.childKey]
              );
              if (join.junctionTable) {
                _.each(groupedResults, function (
                  arrayOfChildrenWithJunction
                ) {
                  _.each(arrayOfChildrenWithJunction, function (
                    childWithJunction
                  ) {
                    delete childWithJunction[join.middleLeftKey];
                  });
                });
              }
              var indexedResults;
              if (childResults.length) {
                if (join.model) {
                  _.each(topLevelResults, function (topLevelResult) {
                    topLevelResult[join.alias] = _.cloneDeep(groupedResults[topLevelResult[join.parentKey]] && groupedResults[topLevelResult[join.parentKey]][0] || null)
                    // groupedResults[topLevelResult[join.parentKey]] ||
                    // [];
                    if (
                      join.removeParentKey &&
                      join.alias !== join.parentKey
                    ) {
                      delete topLevelResult[join.parentKey];
                    }
                  });
                } else {
                  _.each(topLevelResults, function (topLevelResult) {
                    if (typeof groupedResults[topLevelResult[join.parentKey]] !== 'undefined') {
                      topLevelResult[join.alias] = _.cloneDeep(groupedResults[topLevelResult[join.parentKey]])
                      if (join.removeParentKey && (join.alias !== join.parentKey)) {
                        delete topLevelResult[join.parentKey];
                      }
                    } else {
                      topLevelResult[join.alias] = [];
                      if (join.removeParentKey && (join.alias !== join.parentKey)) {
                        delete topLevelResult[join.parentKey];
                      }
                    }
                  });
                }
              } else {
                _.each(topLevelResults, function (topLevelResult) {
                  if (join.model) {
                    topLevelResult[join.alias] = null;
                  }
                  else {
                    topLevelResult[join.alias] = [];
                  }
                  if (join.removeParentKey && (join.alias !== join.parentKey)) {
                    delete topLevelResult[join.parentKey];
                  }
                });
              }
              return childResults;
            });
            // });
            return promises[join.child];
          })
        ).then(function () {
          return topLevelResults;
        });
      })
      .then(function (results) {
        cb(null, results);
      })
      .catch(function (error) {
        console.log('Error during "oldJoin" native join: ', error);
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

function getSchemaName(datastoreName, tableName) {
  // var schemaObject = registeredDatastores[datastoreName].dbSchema[tableName];
  // return schemaObject.meta && schemaObject.meta.schemaName ? schemaObject.meta.schemaName : 'dbo';
  return 'dbo';
}


module.exports = adapter;

awaitableCreate = Promise.promisify(adapter.create);

// handle stuff like json, boolean and date fields.
function normalizeResults(datastoreName, tableName, recordset, { preserveColumns } = {}) {
  if (_.isArray(recordset)) {
    return _.map(recordset, (row) => {
      return normalizeResults(datastoreName, tableName, row, { preserveColumns });
    })
  }
  const tableAttributes = registeredDatastores[datastoreName].dbSchema[tableName].attributes;
  const output = {};
  _.each(tableAttributes, (attrDefinition, attrName) => {
    const columnName = attrDefinition.columnName;
    const columnType = attrDefinition.type;
    const value = recordset[columnName];
    if (!columnName && recordset.hasOwnProperty(attrName)) { // it's not stored here. it's an association.
      return output[attrName] = recordset[attrName];
    }
    if (_.has(recordset, columnName)) {
      if (columnType === 'json' && !_.isEmpty(value) && _.isString(value)) {
        try {
          return output[columnName] = JSON.parse(value);
        }
        catch (e) {
          // if it won't parse just leave it as a string.
          return output[columnName] = value;
        }
      }
      if (attrDefinition.autoMigrations && attrDefinition.autoMigrations.columnType && attrDefinition.autoMigrations.columnType.indexOf('date') === 0) {
        return output[columnName] = moment(value).utc().format('YYYY-MM-DD HH:mm:ss');
      }
      // booleans come back as 1 or 0, need to convert to true/false
      if (columnType === 'boolean') {
        output[columnName] = !!value;
      }
      else {
        output[columnName] = value;
      }
    }
  })
  _.each(preserveColumns, (preserveColumn) => {
    output[preserveColumn] = recordset[preserveColumn];
  });
  return output;
}


