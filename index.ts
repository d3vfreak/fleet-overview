'use strict';
/* eslint-disable @typescript-eslint/no-var-requires */
const needle = require('needle');
const Swagger = require('swagger-client');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const config = require('./data/config');
const path = require('path');
const fs = require('fs');
/* eslint-disable @typescript-eslint/no-var-requires */
const id: string = config.id;
const domain: string = config.domain;
process.on('unhandledRejection', function (err, promise) {
  console.error(
    'Unhandled rejection (promise: ',
    promise,
    ', reason: ',
    err,
    ').'
  );
});

/**
 * Checks if a promise function returns an error if so then it exits the application and shows the error.
 *
 * @param {any} fn - Promise function to check
 * @param {String} msg - Error description to find the root cause faster.
 * @return {[TODO:type]} the given promise
 */
async function handleErr(fn, msg: String) {
  try {
    return await fn; //.catch((e) => Error(`\x1b[31m${msg}\x1b[0m caused by: ${e}`));
  } catch (e) {
    console.log(`\x1b[31m${msg}\x1b[0m caused by: ${e}`);
    return e;
  }
}

/**
 * Function that generates a login link
 *
 * @return {string} Login url that the user will be redirected to.
 */
function generateURL(): string {
  return `https://login.eveonline.com/v2/oauth/authorize?response_type=code&redirect_uri=${domain}/callback/&client_id=${id}&scope=esi-fleets.read_fleet.v1%20esi-location.read_location.v1&state=fleet-checker`;
}

interface Token {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token: string;
}
/**
 * Function that uses the uses the token from the login and gets in return a refresh token.
 *
 * @async
 * @param {string} tempToken - Token from login
 * @return {Promise<Token>} Returns a token object that has the refresh token in it.
 */
async function generateToken(tempToken: string): Promise<Token> {
  const secret: string = config.secret;
  const base: string = Buffer.from(id + ':' + secret).toString('base64');
  return (
    await handleErr(
      needle(
        'post',
        'https://login.eveonline.com/v2/oauth/token',
        { grant_type: 'authorization_code', code: tempToken },
        {
          headers: {
            content_type: 'application/x-www-form-urlencoded',
            Authorization: ' Basic ' + base,
          },
        }
      ),
      'Auth failed'
    )
  ).body;
}

interface SSOData {
  CharacterID: number;
  CharacterName: number;
  ExpiresOn: string;
  Scopes: string;
  TokenType: string;
  CharacterOwnerHash: string;
  ClientID: string;
}
/**
 * Returns the sso information including the account name of the owner of the token.
 *
 * @async
 * @param {string} accToken - The access token.
 * @return {Promise<SSOData>} Object with sso information.
 */
async function verifyToken(accToken: string): Promise<SSOData> {
  // eslint-disable-next-line
  return (
    await handleErr(
      needle(
        'get',
        'https://esi.evetech.net/verify/',
        {},
        {
          headers: {
            content_type: 'application/x-www-form-urlencoded',
            Authorization: 'Bearer ' + accToken,
          },
        }
      ),
      'Auth failed'
    )
  ).body;
}

/**
 * Get an acess token from ccp with a given refresh token.
 *
 * @async
 * @return {Promise<Token>} Returns a token object as a promise with the access_token in it.
 */
async function auth(refreshToken: string): Promise<Token> {
  // eslint-disable-next-line
  return (
    await handleErr(
      needle(
        'post',
        'https://login.eveonline.com/v2/oauth/token',
        {
          grant_type: 'refresh_token',
          client_id: id,
          refresh_token: refreshToken,
        },
        { headers: { content_type: 'application/x-www-form-urlencoded' } }
      ),
      'Auth failed'
    )
  ).body;
}

interface Pilot {
  character_id: number;
  join_time: string;
  role: string;
  role_name: string;
  ship_type_id: number;
  solar_system_id: number;
  squad: number;
  takes_fleet_warp: boolean;
  wing_id: number;
}

interface Ship {
  [key: number]: Pilot;
}

interface Composition {
  [key: string]: Ship;
}

interface Fleet {
  all: Composition;
  fcSystem: any;
}

interface FleetMemberData {
  character_id: number;
  join_time: string;
  role: string;
  role_name: string;
  ship_type_id: number;
  solar_system_id: number;
  squad: number;
  takes_fleet_warp: boolean;
  wing_id: number;
  username: string;
}

/**
 * Function that connect to the esi with the correct headers
 * @async
 * @param {string} - refreshToken for the authentification
 * @return {any} Swagger client object with the eve esi endpoints
 */
async function connectToEsi(refreshToken: string) {
  const tokenData: Token = await auth(refreshToken);
  if (tokenData.access_token === undefined) {
    return {};
  }

  const token = tokenData.access_token;
  const esi = await handleErr(
    Swagger('https://esi.evetech.net/dev/swagger.json', {
      requestInterceptor: (req) => {
        req.headers.Authorization = `Bearer ${token}`;
        return req;
      },
    }),
    'Could not connect to esi'
  );
  return esi;
}

interface User {
  refresh_token: string;
  hash: string;
  alliance: number;
  corp: number;
  id: number;
}
/**
 * Return the current fleet composition of the logged in character.
 *
 * @async
 * @return {Promise<Composition>} Promise with composition.
 */
async function getFleet(
  user: User,
  currentFleet: CurrentFleet
): Promise<Fleet> {
  /* eslint-disable @typescript-eslint/camelcase */

  const esi = await connectToEsi(user.refresh_token);

  const result: Fleet = { all: {}, fcSystem: {} };
  const currentFleetId: number = currentFleet.fleet_id;
  let fleet = await handleErr(
    esi.apis.Fleets.get_fleets_fleet_id_members({
      fleet_id: currentFleetId,
    }),
    '[' + user.id + '] User is not fleet boss'
  );
  if (fleet.body === undefined) {
    return Promise.reject(result);
    //return result;
  }
  fleet = fleet.body;

  const location = (
    await handleErr(
      esi.apis.Location.get_characters_character_id_location({
        character_id: user.id,
      }),
      'Failed to get location of fc.'
    )
  ).body.solar_system_id;

  const eve = JSON.parse(
    await fs.promises.readFile('./data/eve.json', {
      encoding: 'utf-8',
    })
  );
  const fcSystem = {};
  const comp = {};
  for (const member in fleet) {
    if (eve['universe']['ships'][fleet[member].ship_type_id] === undefined) {
      eve['universe']['ships'][fleet[member].ship_type_id] = (
        await handleErr(
          esi.apis.Universe.get_universe_types_type_id({
            type_id: fleet[member].ship_type_id,
          }),
          'Getting ship type failed'
        )
      ).body.name;
    }
    const shipName = eve['universe']['ships'][fleet[member].ship_type_id];

    const username = (
      await handleErr(
        esi.apis.Character.get_characters_character_id({
          character_id: fleet[member].character_id,
        }),
        '[' + user.id + '] failed getting user'
      )
    ).body.name;
    fleet[member].username = username;

    const obj = { [fleet[member].character_id]: fleet[member] };
    if (location === fleet[member].solar_system_id) {
      fcSystem[shipName] =
        fcSystem[shipName] === undefined
          ? obj
          : Object.assign(fcSystem[shipName], obj);
    }

    comp[shipName] =
      comp[shipName] === undefined ? obj : Object.assign(comp[shipName], obj);
  }
  result.all = comp;
  result.fcSystem = fcSystem;
  await fs.promises.writeFile('./data/eve.json', JSON.stringify(eve));
  /* eslint-enable @typescript-eslint/camelcase */
  return result;
}

/**
 * Reads the data/filters.json file and returns it as a json object.
 *
 * @async
 * @return {[TODO:type]} [TODO:description]
 */
async function fleetFilters() {
  const filters = JSON.parse(
    await fs.promises.readFile('./data/filters.json', { encoding: 'utf-8' })
  );
  return filters;
}

interface PublicInfo {
  alliance_id: number;
  ancestry_id: number;
  birthday: string;
  bloodline_id: number;
  corporation_id: number;
  description: string;
  gender: string;
  name: string;
  race_id: number;
  security_status: number;
}
/**
 * Gets the public info of an eve player
 *
 * @async
 * @param {number} playerID - eve player id
 * @return {Promise<PublicInfo>} object with the player data
 */
async function getPublicInfo(playerID: number): Promise<PublicInfo> {
  return (
    await handleErr(
      needle(
        'get',
        `https://esi.evetech.net/latest/characters/${playerID}/?datasource=tranquility`,
        {},
        { headers: { content_type: 'application/x-www-form-urlencoded' } }
      ),
      'Could not get player data'
    )
  ).body;
}

/**
 * Function that removes setInterval timer on socket disconnect
 *
 * @param {object} socket - [TODO:description]
 * @param {object} timer - setInterval timer
 * @return {void}
 */
function removeTimerOnDisconnect(socket, timer): void {
  if (socket.disconnected === true) {
    clearTimeout(timer);
  }
}

interface CurrentFleet {
  fleet_boss_id: number;
  fleet_id: number;
  role: string;
  squad_id: number;
  wing_id: number;
}

/**
 * Function that checks the fleet data when the player is in a fleet and fleet boss.
 *
 * @async
 * @param {CurrentFleet} currentFleet - Fleet that needs to be checked out.
 * @param {[TODO:type]} socket - [TODO:description]
 * @param {User} user - Current logged in user
 * @param {[TODO:type]} timers - [TODO:description]
 * @return {Promise<void>} [TODO:description]
 */
async function fleetCheck(
  currentFleet: CurrentFleet,
  socket,
  user: User,
  timers
): Promise<void> {
  removeTimerOnDisconnect(socket, timers[user.id].fleetTime);
  console.info('[' + user.id + ']', 'getting fleet members');
  const genChartData = await getFleet(user, currentFleet).catch((res) => {
    clearTimeout(timers[user.id].fleetTime);
    delete timers[user.id].fleetTime;
    return res;
  });
  socket.emit('fleetUpdate', genChartData);
}

/**
 * Function that checks if player is in a fleet. If he is an a fleet it will start a loop to check the fleet members.
 *
 * @async
 * @param {[TODO:type]} socket - [TODO:description]
 * @param {[TODO:type]} timers - [TODO:description]
 * @param {[TODO:type]} user - [TODO:description]
 * @return {[TODO:type]} [TODO:description]
 */
async function checkIfPlayerIsInFleet(socket, timers, user: User) {
  removeTimerOnDisconnect(socket, timers[user.id].inFleet);
  console.info('[' + user.id + ']', 'checking if player is in a fleet.');

  const esi = await connectToEsi(user.refresh_token);
  try {
    let currentFleet = await esi.apis.Fleets.get_characters_character_id_fleet({
      character_id: user.id,
    }).catch(() => {
      if (timers[user.id].hasOwnProperty('fleetTime') === true) {
        clearTimeout(timers[user.id].fleetTime);
      }
    });

    if (
      timers[user.id].hasOwnProperty('fleetTime') === false &&
      currentFleet !== undefined &&
      currentFleet.body.fleet_boss_id === user.id
    ) {
      currentFleet = currentFleet.body;
      const timer = setInterval(() => {
        fleetCheck(currentFleet, socket, user, timers);
      }, 6000);
      timers[user.id].fleetTime = timer;
      fleetCheck(currentFleet, socket, user, timers);
    }
  } catch (e) {
    if (timers[user.id].hasOwnProperty('fleetTime') === true) {
      clearTimeout(timers[user.id].fleetTime);
      delete timers[user.id].fleetTime;
    }
  }
}

server.listen(3000);
app.use('/', express.static(path.join(__dirname, 'static')));

{
  let db = undefined;
  /*
   Register account callback that generates a login token and cookie and saves it in the data/tokens.json.
*/
  app.use('/callback/', (req, res) => {
    const code = req.query.code;
    if (code === undefined || code === '') {
      res.send('login failed');
      return false;
    }
    const crypto = require('crypto');
    const hash = crypto.randomBytes(20).toString('hex');
    (async function () {
      const token = await generateToken(code);
      if (token.refresh_token === undefined) {
        return false;
      }
      const rfToken = token.refresh_token;
      const user = await verifyToken(token.access_token);
      db = JSON.parse(
        await fs.promises.readFile('./data/tokens.json', {
          encoding: 'utf-8',
        })
      );
      if (db[user.CharacterName] === undefined) {
        const info = await getPublicInfo(user.CharacterID);

        const sso = await handleErr(
          verifyToken(token.access_token),
          'Getting CharacterID failed'
        );

        db[user.CharacterName] = {
          refresh_token: rfToken,
          hash: hash,
          alliance: info.alliance_id,
          corp: info.corporation_id,
          id: sso.CharacterID,
        };
      } else {
        db[user.CharacterName].refresh_token = rfToken;
        db[user.CharacterName].hash = hash;
      }
      await fs.promises.writeFile('./data/tokens.json', JSON.stringify(db));
      res.cookie('user', user.CharacterName, {
        maxAge: 31536000,
        SameSite: 'strict',
      });
      res.cookie('hash', hash, {
        maxAge: 31536000,
        SameSite: 'strict',
      });
      res.redirect(domain);
    })();
  });

  /**
   * Function that setups the application.
   *
   * @async
   * @return {void}
   */
  async function run(): Promise<void> {
    const filters = await fleetFilters();
    const timers = {};
    db = JSON.parse(
      await fs.promises.readFile('./data/tokens.json', {
        encoding: 'utf-8',
      })
    );
    io.on('connection', (socket) => {
      socket.on('link', () => {
        socket.emit('loginURL', generateURL());
      });

      socket.on('login', (auth) => {
        if (db[auth.user] === undefined || db[auth.user].hash !== auth.hash) {
          socket.emit('clearCookies', {});
          return false;
        }
        const sendFilters =
          filters[db[auth.user].corp] === undefined
            ? filters['all']
            : filters[db[auth.user].corp];
        socket.emit('filters', sendFilters);

        const timer = setInterval(() => {
          checkIfPlayerIsInFleet(socket, timers, db[auth.user]);
        }, 61000);
        timers[db[auth.user].id] = { inFleet: timer };
        checkIfPlayerIsInFleet(socket, timers, db[auth.user]);
      });
    });
  }

  run();
}
