var adapter = require('../../');
var expect = require("chai").expect;

var util = adapter.util;

describe('util stuffs', function () {
  var teamAttrs;
  beforeEach(function () {
    teamAttrs = {
      "name": {
        "type": "string",
        "audit": true
      },
      "segment": {
        "model": "segment"
      },
      "alias": {
        "type": "string"
      },
      "vsEnablerCode": {
        "type": "string"
      },
      "solutionGroupCode": {
        "type": "string"
      },
      "offeringCode": {
        "type": "string"
      },
      "methodology": {
        "type": "string"
      },
      "status": {
        "type": "string"
      },
      "count": {
        "type": "integer",
        "defaultsTo": 0
      },
      "archived": {
        "type": "boolean",
        "defaultsTo": false,
        "audit": true
      },
      "kickoff": {
        "type": "boolean",
        "defaultsTo": false,
        "audit": true
      },
      "planningTools": {
        "type": "json"
      },
      "coach": {
        "model": "user"
      },
      "indicators": {
        "collection": "indicator",
        "via": "team"
      },
      "answersets": {
        "collection": "answerset",
        "via": "team"
      },
      "rallyProjects": {
        "collection": "rallyproject",
        "via": "teams",
        "dominant": true,
        "manyToMany": true
      },
      "memberships": {
        "collection": "membership",
        "via": "team"
      },
      "users": {
        "collection": "user",
        "via": "teams",
        "manyToMany": true
      },
      "apps": {
        "collection": "app",
        "via": "teams",
        "manyToMany": true
      },
      "goals": {
        "collection": "goal",
        "via": "team"
      },
      "createdBy": {
        "type": "string"
      },
      "updatedBy": {
        "type": "string"
      },
      "id": {
        "type": "integer",
        "autoIncrement": true,
        "primaryKey": true,
        "unique": true
      },
      "createdAt": {
        "type": "datetime",
        "default": "NOW"
      },
      "updatedAt": {
        "type": "datetime",
        "default": "NOW"
      }
    }
  })

  it('should wrap strings with single-quotes', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: 'bob' } })).to.equal(`[team].[name] = 'bob'`);
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: '3' } })).to.equal(`[team].[count] = '3'`);
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: 3 } })).to.equal(`[team].[count] = 3`);
  });
  it('should handle null', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: null } })).to.equal(`[team].[name] is null`);
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { '!=': null } } }))
      .to.equal(`[team].[count] is not null`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { 'not': null } } }))
      .to.equal(`[team].[count] is not null`)
  });
  it('should handle booleans', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: false } })).to.equal(`[team].[name] = 0`);
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: true } })).to.equal(`[team].[name] = 1`);
  });
  it('should combine multiple parameters as an AND clause', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: 'bob', count: 3 } }))
      .to.equal(`[team].[name] = 'bob' AND [team].[count] = 3`);
  });
  it('should handle "and" in waterline query as an AND clause', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { and: [{ name: 'bob' }, { count: 3 }] } }))
      .to.equal(`(([team].[name] = 'bob') AND ([team].[count] = 3))`);
  });
  it('should convert <', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { '<': 3 } } }))
      .to.equal(`[team].[count] < 3`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { '<': 'bob' } } }))
      .to.equal(`[team].[name] < 'bob'`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { 'lessThan': 3 } } }))
      .to.equal(`[team].[count] < 3`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { 'lessThan': 'bob' } } }))
      .to.equal(`[team].[name] < 'bob'`)
  })
  it('should convert <=', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { '<=': 3 } } }))
      .to.equal(`[team].[count] <= 3`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { '<=': 'bob' } } }))
      .to.equal(`[team].[name] <= 'bob'`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { 'lessThanOrEqual': 3 } } }))
      .to.equal(`[team].[count] <= 3`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { 'lessThanOrEqual': 'bob' } } }))
      .to.equal(`[team].[name] <= 'bob'`)
  })
  it('should convert >', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { '>': 3 } } }))
      .to.equal(`[team].[count] > 3`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { '>': 'bob' } } }))
      .to.equal(`[team].[name] > 'bob'`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { 'greaterThan': 3 } } }))
      .to.equal(`[team].[count] > 3`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { 'greaterThan': 'bob' } } }))
      .to.equal(`[team].[name] > 'bob'`)
  })
  it('should convert >=', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { '>=': 3 } } }))
      .to.equal(`[team].[count] >= 3`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { '>=': 'bob' } } }))
      .to.equal(`[team].[name] >= 'bob'`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { 'greaterThanOrEqual': 3 } } }))
      .to.equal(`[team].[count] >= 3`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { 'greaterThanOrEqual': 'bob' } } }))
      .to.equal(`[team].[name] >= 'bob'`)
  })

  it('should convert !=', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { '!=': 'bob' } } }))
      .to.equal(`[team].[name] <> 'bob'`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { '!=': 3 } } }))
      .to.equal(`[team].[count] <> 3`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { 'not': 'bob' } } }))
      .to.equal(`[team].[name] <> 'bob'`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { count: { 'not': 3 } } }))
      .to.equal(`[team].[count] <> 3`)
  })

  it('should convert like', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { like: 'bob%' } } }))
      .to.equal(`[team].[name] LIKE 'bob%'`)
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { like: '%bob%' } } }))
      .to.equal(`[team].[name] LIKE '%bob%'`)
  })
  it('should convert contains to LIKE', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { contains: 'bob' } } }))
      .to.equal(`[team].[name] LIKE '%bob%'`)
  })
  it('should convert startsWith', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { startsWith: 'bob' } } }))
      .to.equal(`[team].[name] LIKE 'bob%'`);
  })
  it('should convert endsWith', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { endsWith: 'bob' } } }))
      .to.equal(`[team].[name] LIKE '%bob'`);
  })

  it('should convert arrays', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: ['bob', 'sue'] } }))
      .to.equal(`[team].[name] IN ('bob', 'sue')`);
  })

  it('should convert != arrays', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { name: { '!=': ['bob', 'sue'] } } }))
      .to.equal(`[team].[name] NOT IN ('bob', 'sue')`);
  })

  it('should convert or arrays', function () {
    expect(util.parseWherePhrase({ tableAs: 'team', where: { or: [{ name: { '!=': ['bob', 'sue'] } }, { name: 'ann' }] } }))
      .to.equal(`(([team].[name] NOT IN ('bob', 'sue')) OR ([team].[name] = 'ann'))`);
  })
});
