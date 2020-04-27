'use strict';
const ctx = document.getElementById('myChart');
const url = window.location.href;
const socket = io.connect(url);
declare const Chart: any;
const fleetDropdown = document.getElementById('filter');
const systemDropdown = document.getElementById('systemFilter');
const myChart = new Chart(ctx, {
  type: 'outlabeledPie',
  options: {
    zoomOutPercentage: 65, // makes chart 55% smaller (50% by default, if the preoprty is undefined)
    plugins: {
      legend: true,
      outlabels: {
        text: '%v %l %p',
        color: 'white',
        stretch: 35,
        font: {
          resizable: true,
          minSize: 12,
          maxSize: 18,
        },
      },
    },
  },
});

interface PlayerData {
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
  wing_id: number;
}
interface Players {
  [key: number]: PlayerData;
}
function genUI(data: API, fleetTypes): void {
  setupChart(
    (fleetDropdown as HTMLOptionElement).value,
    data,
    fleetTypes,
    (systemDropdown as HTMLOptionElement).value
  );
}

function getCookie(name) {
  const match = document.cookie.match(
    RegExp('(?:^|;\\s*)' + name + '=([^;]*)')
  );
  return match ? match[1] : false;
}
function delete_cookie(name) {
  document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

SETUP: {
  let players: Players = {};
  let systems = {};
  let fleet: API = {};
  let filters;
  const user = getCookie('user');
  const hash = getCookie('hash');
  if (user === false && hash === false) {
    socket.emit('link', {});
    socket.on('loginURL', (url) => {
      console.log(url);
      window.location.replace(url);
    });
    break SETUP;
  }

  socket.emit('login', { user: user, hash: hash });
  //socket.emit('filters');
  socket.on('clearCookies', () => {
    delete_cookie('user');
    delete_cookie('hash');
    location.reload();
  });

  fleetDropdown.addEventListener('change', function () {
    genUI(fleet, filters);
  });

  systemDropdown.addEventListener('change', function () {
    genUI(fleet, filters);
  });

  socket.on('fleetUpdate', (data) => {
    if (data === undefined) {
      return;
    }
    genUI(data, filters);
    fleet = data;
  });

  socket.on('filters', (data) => {
    filters = data;
    Object.keys(data).map((filter) => {
      const option = document.createElement('option');
      option.setAttribute('value', filter);
      option.innerHTML = filter;
      fleetDropdown.appendChild(option);
    });
  });
}

async function apiCall(route: string) {
  const resp = await fetch(`https://esi.evetech.net/latest/${route}`);
  return await resp.json();
}

const addChar = async function (
  id: string,
  collection: Players
): Promise<void> {
  if (collection[id] !== undefined) {
    return;
  }
  const player = await apiCall(`characters/${id}/?datasource=tranquility`);
  collection[id] = player;
};

interface FleetMember {
  [key: number]: FleetMemberData;
}

interface API {
  [key: string]: FleetMember;
}

function setupChart(
  fleetType: string,
  data: API,
  fleetTypes: {},
  systemsFilter
): void {
  let ships = Object.keys(data);
  /* if (systems[systemsFilter] !== undefined) {
    for (const ship of ships) {
      for (const pilot of Object.keys(data[ship])) {
        if (
          data[ship][parseInt(pilot)].solar_system_id ===
          parseInt(systemsFilter)
        ) {
          delete data[ship][parseInt(pilot)];
        }
      }
    }
  }
*/
  if (fleetTypes[fleetType] !== undefined) {
    const filter = new Set(fleetTypes[fleetType]);
    ships = ships.filter((x) => filter.has(x));
  }

  const shipNumbers = ships.map((type) => {
    return data[type] !== undefined ? Object.keys(data[type]).length : 0;
  });
  myChart.options.tooltips = {
    callbacks: {
      label: function (tooltipItem, chLabels) {
        const test = Object.keys(data[chLabels.labels[tooltipItem.index]]);
        let labels = test.map((player) => {
          return data[chLabels.labels[tooltipItem.index]][player].username;
        });
        return labels;
      },
    },
  };
  myChart.data = {
    labels: ships,
    datasets: [
      {
        label: '# Composition',
        data: shipNumbers,
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(54, 162, 235, 0.2)',
          'rgba(255, 206, 86, 0.2)',
          'rgba(75, 192, 192, 0.2)',
          'rgba(153, 102, 255, 0.2)',
          'rgba(255, 159, 64, 0.2)',
          'rgba(255, 159, 64, 0.2)',
          'rgba(255, 59, 64, 0.2)',
          'rgba(255, 22, 219, 0.2)',
          'rgba(255, 89, 64, 0.2)',
          'rgba(255, 24, 64, 0.2)',
          'rgba(255, 169, 134, 0.2)',
          'rgba(255, 119, 184, 0.2)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };
  myChart.update(0);
}
let i = 0;
async function addSystem(id, systems) {
  if (systems[id] !== undefined) {
    return false;
  }
  const system = await apiCall(
    `universe/systems/${id}/?datasource=tranquility`
  );
  systems[id] = system;
  const option = document.createElement('option');
  option.setAttribute('value', system.system_id);
  option.innerHTML = system.name;
  systemDropdown.appendChild(option);
  i++;
}
