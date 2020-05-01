'use strict';
const ctx = document.getElementById('myChart');
const url = window.location.href;
const socket = io.connect(url);
declare const Chart: any;
declare const vex: any;
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
function genUI(data: Fleet, fleetTypes): void {
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

function showInfo() {
  vex.defaultOptions.className = 'vex-theme-top';
  vex.dialog.buttons.YES.text = 'Continue to login';
  // vex.dialog.buttons.NO.text = 'Not interested.';
  vex.dialog.open({
    //message: 'Welcome to Fleet Overview',
    input: `<span style="font-weight:bold">Welcome to Fleet Overview</span><br/>
    Fleet Overview is a tool that gives you real time informations of your current fleet composition.<br/><br/>
    You can sort your fleet by predefined filters and if you host this app yourself you can create your own filters.<br/><br/>
      This App need two permissions <span class="bold">esi-fleets.read_fleet.v1</span> to read your fleet data and <span class="bold">esi-location.read_location.v1</span> to filter the fleet on your location.<br/>
      <span class="bold">The app can only work if you are logged in and you have to be the fleet boss of your current fleet.</span>`,
    callback: function (value) {
      if (value !== false) {
        socket.emit('link', {});
      }
    },
  });
}

function showHelp() {
  vex.defaultOptions.className = 'vex-theme-top';
  // vex.dialog.buttons.NO.text = 'Not interested.';
  vex.dialog.alert({
    //message: 'Welcome to Fleet Overview',
    unsafeMessage: `
    <span style="font-weight:bold">Help</span><br/>
    If you see none of your fleet members showing up make sure that you are in a fleet and that you are the fleet boss of that fleet.<br/><br/>
    This application checks every 30 seconds if you are in a fleet so you maybe need wait a bit more for it to see that you are in fleet.<br/><br/>
    If you are wondering why the ship type is not updating it takes CCP up to 40 seconds to update the ship type.`,
  });
}

document.addEventListener('DOMContentLoaded', function () {
  SETUP: {
    let players: Players = {};
    let systems = {};
    let fleet: Fleet = { all: {}, fcSystem: {} };
    let filters;
    const user = getCookie('user');
    const hash = getCookie('hash');
    if (user === false && hash === false) {
      document
        .getElementById('learnMore')
        .addEventListener('click', function () {
          showInfo();
        });
      socket.on('loginURL', (url) => {
        window.location.replace(url);
      });
      showInfo();
      break SETUP;
    }

    socket.emit('login', { user: decodeURI(user.toString()), hash: hash });
    //socket.emit('filters');
    socket.on('clearCookies', () => {
      delete_cookie('user');
      delete_cookie('hash');
      location.reload();
    });

    document.getElementById('past-login').style.display = 'flex';
    document.getElementById('pre-login').style.display = 'none';
    fleetDropdown.addEventListener('change', function () {
      genUI(fleet, filters);
    });

    document.getElementById('help').addEventListener('click', function () {
      showHelp();
    });
    document.getElementById('logout').addEventListener('click', function () {
      delete_cookie('user');
      delete_cookie('hash');
      location.reload();
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
});

interface FleetMember {
  [key: number]: FleetMemberData;
}

interface API {
  [key: string]: FleetMember;
}

function setupChart(
  fleetType: string,
  data: Fleet,
  fleetTypes: {},
  systemsFilter
): void {
  let systemData;
  if (systemsFilter === 'everySystem') {
    systemData = data.all;
  } else {
    systemData = data.fcSystem;
  }

  let ships = Object.keys(systemData);

  console.log(systemsFilter);

  if (fleetTypes[fleetType] !== undefined) {
    const filter = new Set(fleetTypes[fleetType]);
    ships = ships.filter((x) => filter.has(x));
  }

  const shipNumbers = ships.map((type) => {
    return systemData[type] !== undefined
      ? Object.keys(systemData[type]).length
      : 0;
  });
  myChart.options.tooltips = {
    callbacks: {
      label: function (tooltipItem, chLabels) {
        const players = Object.keys(
          systemData[chLabels.labels[tooltipItem.index]]
        );
        let labels = players.map((player) => {
          return systemData[chLabels.labels[tooltipItem.index]][player]
            .username;
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
