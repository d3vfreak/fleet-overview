

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

export type Fleet = {
  all: Composition;
  fcSystem: any;
}


