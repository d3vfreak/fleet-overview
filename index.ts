'use strict';
/* eslint-disable @typescript-eslint/no-var-requires */
const needle = require('needle');
const Swagger = require('swagger-client');
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const config = require('./data/config');
const path = require('path');
const fs = require('fs');
/* eslint-disable @typescript-eslint/no-var-requires */
const id: string = config.id;
const domain: string = config.domain;
let db;
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
  return `https://login.eveonline.com/v2/oauth/authorize?response_type=code&redirect_uri=${domain}/callback/&client_id=${id}&scope=esi-fleets.read_fleet.v1&state=fleet-checker`;
}

/**
 * Function that uses the uses the token from the login and gets in return a refresh token.
 *
 * @async
 * @param {string} tempToken - Token from login
 * @return {[TODO:type]}
 */
async function generateToken(tempToken: string): Promise<any> {
  const secret: string = config.secret;
  const base = Buffer.from(id + ':' + secret).toString('base64');
  // eslint-disable-next-line
  const token = await handleErr(
    needle(
      'post',
      `https://login.eveonline.com/v2/oauth/token`,
      { grant_type: 'authorization_code', code: tempToken },
      {
        headers: {
          content_type: 'application/x-www-form-urlencoded',
          Authorization: ' Basic ' + base,
        },
      }
    ),
    'Auth failed'
  );
  return token.body;
}

async function verifyToken(accToken: string): Promise<any> {
  // eslint-disable-next-line
  const token = await handleErr(
    needle(
      'get',
      `https://esi.evetech.net/verify/`,
      {},
      {
        headers: {
          content_type: 'application/x-www-form-urlencoded',
          Authorization: 'Bearer ' + accToken,
        },
      }
    ),
    'Auth failed'
  );
  return token.body;
}

interface Token {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token: string;
}

/**
 * Get an acess token from ccp with a given refresh token.
 *
 * @async
 * @return {Promise<Token>} Returns a token object as a promise
 */
async function auth(refreshToken: string): Promise<Token> {
  // eslint-disable-next-line
  const accToken = await handleErr(
    needle(
      'post',
      `https://login.eveonline.com/v2/oauth/token`,
      {
        grant_type: 'refresh_token',
        client_id: id,
        refresh_token: refreshToken,
      },
      { headers: { content_type: 'application/x-www-form-urlencoded' } }
    ),
    'Auth failed'
  );
  return accToken.body;
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
 * Return the current fleet composition of the logged in character.
 *
 * @async
 * @return {Promise<Composition>} Promise with composition.
 */
async function getFleet(refreshToken: string): Promise<Composition> {
  /* eslint-disable @typescript-eslint/camelcase */
  const tokenData: Token = await auth(refreshToken);
  if (tokenData.access_token === undefined) {
    return {};
  }

  const token = tokenData.access_token;
  const sso = await handleErr(verifyToken(tokenData.access_token), 'SSO Test');
  const esi = await handleErr(
    Swagger('https://esi.evetech.net/latest/swagger.json', {
      requestInterceptor: (req) => {
        req.headers.Authorization = `Bearer ${token}`;
        return req;
      },
    }),
    'Swagger error'
  );

  interface ActiveFleet {
    fleet_id: number;
    role: string;
    squad: number;
    wing: number;
  }
  const currentFleet: ActiveFleet = (
    await handleErr(
      esi.apis.Fleets.get_characters_character_id_fleet({
        character_id: sso.CharacterID,
      }),
      `Getting fleet of player failed`
    )
  ).body;

  const comp: Composition = {};
  if (currentFleet === undefined) {
    return comp;
  }
  const currentFleetId: number = currentFleet.fleet_id;
  const fleet: Array<FleetMemberData> = (
    await handleErr(
      esi.apis.Fleets.get_fleets_fleet_id_members({
        fleet_id: currentFleetId,
      }),
      'Getting members of current fleet failed.'
    )
  ).body;

  const eve = JSON.parse(
    await fs.promises.readFile('./data/eve.json', {
      encoding: 'utf-8',
    })
  );
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
        'failed getting user'
      )
    ).body.name;
    fleet[member].username = username;

    const obj = { [fleet[member].character_id]: fleet[member] };
    comp[shipName] =
      comp[shipName] === undefined ? obj : Object.assign(comp[shipName], obj);
  }
  await fs.promises.writeFile('./data/eve.json', JSON.stringify(eve));
  /* eslint-enable @typescript-eslint/camelcase */
  return comp;
}

async function fleetFilters() {
  const filters = JSON.parse(
    await fs.promises.readFile('./data/filters.json', { encoding: 'utf-8' })
  );
  return filters;
}

async function getPublicInfo(playerID) {
  const info = await handleErr(
    needle(
      'get',
      `https://esi.evetech.net/latest/characters/${playerID}/?datasource=tranquility`,
      {},
      { headers: { content_type: 'application/x-www-form-urlencoded' } }
    ),
    'Could not get char_info'
  );
  return info.body;
}
server.listen(3000);
app.use('/', express.static(path.join(__dirname, 'static')));
app.use('/callback/', (req, res) => {
  const code = req.query.code;
  if (code === undefined || code === '') {
    res.send('login failed');
    return false;
  }
  const crypto = require('crypto');
  const hash = crypto.randomBytes(20).toString('hex');
  let rfToken;
  let cID;
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
      db[user.CharacterName] = {
        refresh_token: rfToken,
        hash: hash,
        alliance: info.alliance_id,
        corp: info.corporation_id,
      };
    } else {
      db[user.CharacterName].refresh_token = rfToken;
      db[user.CharacterName].hash = hash;
    }
    await fs.promises.writeFile('./data/tokens.json', JSON.stringify(db));
    res.cookie('user', user.CharacterName, {
      //expires: new Date(new Date().getFullYear() + 900000),
      maxAge: 31536000,
      SameSite: 'strict',
    });
    res.cookie('hash', hash, {
      maxAge: 31536000,
      //expires: new Date(new Date().getFullYear() + 900000),
      SameSite: 'strict',
    });
    res.redirect(domain);
  })();
});

let timers = {};
(async function () {
  const filters = await fleetFilters();
  db = JSON.parse(
    await fs.promises.readFile('./data/tokens.json', {
      encoding: 'utf-8',
    })
  );
  io.on('connection', (socket) => {
    /*socket.on('filters', () => {
      socket.emit('filters', filters);
    });*/
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
      const fleetCheck = async () => {
        if (socket.disconnected === true) {
          clearTimeout(timers[db[auth.user]]);
        }
        const genChartData = await getFleet(db[auth.user].refresh_token);
        socket.emit('fleetUpdate', genChartData);
      };
      //fleetCheck();
      const timer = setInterval(fleetCheck, 5000);
      timers[db[auth.user]] = timer;
    });
  });
})();
