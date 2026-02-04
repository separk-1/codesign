// src/utils/logger.ts

export interface LogEntry {
  timestamp: string;
  type: 'ACTION' | 'SNAPSHOT';
  data: any;
}

// Mapping from internal store keys to canonical display names
const KEY_MAPPING: Record<string, string> = {
  // Instruments (Display Values)
  display_reactivity: "Reactivity",
  display_core_t: "Core Temperature",
  display_steam_press: "Steam Pressure",
  turbine_rpm: "Turbine Speed",
  display_sg_level: "SG Level",
  display_pri_flow: "Primary Flow",
  display_fw_flow: "Feedwater Flow",

  // Controls / Components
  rcp: "Reactor Coolant Pump",
  fw_pump: "Feedwater Pump",
  msiv: "Main Steam Isolation Valve",
  turbine_speed_cv: "Turbine Speed Control Valve",
  turbine_load_cv: "Turbine Load Control Valve",
  turbine_bypass_cv: "Turbine Bypass Control Valve",
  fwcv_degree: "Feedwater Control Valve",
  fwiv: "Feedwater Isolation Valve",

  // Additional Controls
  trip_reactor: "Trip Reactor",
  trip_turbine: "Trip Turbine",
  activate_si: "Safety Injection",
  porviv: "Power Operated Relief Valve",
  fwcv_mode: "Feedwater Control Mode", // Auto/Manual
};

class Logger {
  private logs: LogEntry[] = [];
  private session_id: string;

  constructor() {
    this.session_id = `session_${Date.now()}`;
    console.log(`[Logger] Initialized session: ${this.session_id}`);
  }

  // Action Log
  logAction(action_type: string, details: { target?: string, value?: any, [key: string]: any }) {
    // Map target if it exists
    let mappedDetails = { ...details };
    if (mappedDetails.target && KEY_MAPPING[mappedDetails.target]) {
        mappedDetails.target_canonical = KEY_MAPPING[mappedDetails.target];
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type: 'ACTION',
      data: {
        session_id: this.session_id,
        action_type,
        ...mappedDetails
      }
    };
    this.logs.push(entry);
    console.log('[ACTION]', action_type, details);
  }

  // Snapshot Log: Dump everything that isn't a function
  logSnapshot(state: any) {
    const cleanState: any = { session_id: this.session_id };

    for (const key in state) {
        if (typeof state[key] !== 'function' && key !== 'alarms') {
            // Use mapped key if available, otherwise keep original
            const mappedKey = KEY_MAPPING[key] || key;
            cleanState[mappedKey] = state[key];
        }
    }

    this.logs.push({
      timestamp: new Date().toISOString(),
      type: 'SNAPSHOT',
      data: cleanState
    });
  }

  exportLogs() {
    const exportData = {
      session_id: this.session_id,
      generated_at: new Date().toISOString(),
      logs: this.logs
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `npp_log_${this.session_id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  getLogs() {
      return this.logs;
  }
}

export const logger = new Logger();
