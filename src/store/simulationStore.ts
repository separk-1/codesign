import { create } from 'zustand';
import { logger } from '../utils/logger';

// Physics Constants
const TICK_RATE = 100; // ms (10Hz)
const DT = TICK_RATE / 1000; // seconds

export type ScenarioPreset = 'cv' | 'pump' | 'hard';

interface ProcedureRule {
  after_action: string;
  scenario: string; // 'all', 'A', 'B', 'C'
  status: string;
  updates: Record<string, string>; // key -> value (raw string from CSV)
}

interface ActiveTransition {
  varName: keyof SimulationState;
  startVal: number;
  targetVal: number;
  startTime: number;
  duration: number;
}

interface SimulationState {
  // --- System Configuration ---
  scenarioPreset: ScenarioPreset;
  trainingMode: boolean; // false = Deterministic, true = Stochastic
  time: number; // Simulation time in seconds
  tick_count: number;
  simulationEnded: boolean;

  // --- Rules Engine ---
  procedureRules: ProcedureRule[];
  triggeredRules: Set<string>; // IDs of time-based rules that have fired
  activeTransitions: ActiveTransition[];
  loadProcedureRules: () => Promise<void>;
  triggerStepAction: (stepId: string) => void;

  // --- System State (Float/Int) ---
  last_log_time: number;

  // Reactor
  reactivity: number;      // 0-100% (Power)
  display_reactivity: number; // Noisy

  core_t: number;          // 0-400 DEG C
  display_core_t: number;  // Noisy

  pri_flow: number;        // L/sec (Nominal ~45000?)
  display_pri_flow: number;// Noisy

  // SG
  fw_flow: number;         // L/sec
  display_fw_flow: number; // Noisy

  fwcv_degree: number;     // 0.0 - 1.0
  fwcv_continuous: number; // 0.0 - 1.0 (Internal continuous)
  sg_level: number;        // 0-100%
  display_sg_level: number;// Noisy

  steam_press: number;     // kg/cm2
  display_steam_press: number; // Noisy

  // Turbine
  turbine_speed_cv: number; // 0.0-1.0
  turbine_load_cv: number;  // 0.0-1.0
  turbine_bypass_cv: number;// 0.0-1.0
  turbine_rpm: number;      // Derived for display

  // --- Controls (Boolean/Controllable) ---
  // Reactor
  trip_reactor: boolean;
  activate_si: boolean;
  rcp: boolean;
  porviv: boolean;

  // SG
  fwcv_mode: boolean; // true = Auto, false = Manual
  fwiv: boolean;
  msiv: boolean;
  fw_pump: boolean;

  // Turbine
  trip_turbine: boolean;

  // --- Malfunctions (Hidden) ---
  fault_active: boolean; // Triggered after 5-10s

  // --- Annunciators (Boolean - Read Only) ---
  // Primary
  rx_over_limit: boolean;
  high_temp_high_rx_trip: boolean;
  core_temp_high: boolean;
  cnmt_rad_monitor: boolean;
  safety_injection_engaged: boolean;
  core_temp_low: boolean;
  all_rods_down: boolean;
  reactor_coolant_pump_trip: boolean;
  low_primary_coolant: boolean;

  // Secondary
  sg_high_level: boolean;
  ms_rad_monitor: boolean;
  sg_low_level: boolean;
  low_turbine_pressure: boolean;
  fw_low_flow: boolean;
  fw_pump_trip: boolean;

  // Turbine
  turbine_trip: boolean;
  atmos_dump_active: boolean;
  ready_to_roll: boolean;
  ready_to_sync: boolean;
  not_latched: boolean;
  not_synced_to_grid: boolean;

  // --- Procedures ---
  activeStepId: string | null;
  stepHistory: string[];
  setActiveStepId: (id: string | null) => void;
  goToPreviousStep: () => void;

  // --- Actions ---
  setScenarioPreset: (preset: ScenarioPreset) => void;
  toggleTrainingMode: () => void;
  resetSimulation: () => void;

  // Reactor Controls
  toggleTripReactor: () => void;
  toggleSi: () => void;
  toggleRcp: () => void;
  togglePorv: () => void;

  // SG Controls
  toggleFwcvMode: () => void;
  setFwcvDegree: (val: number) => void;
  toggleFwiv: () => void;
  toggleMsiv: () => void;
  toggleFwPump: () => void;

  // Turbine Controls
  toggleTripTurbine: () => void;
  setTurbineSpeedCv: (val: number) => void;
  setTurbineLoadCv: (val: number) => void;
  setTurbineBypassCv: (val: number) => void;

  tick: () => void;
}

// Helper to add noise
const addNoise = (val: number, magnitude: number) => {
    return val + (Math.random() - 0.5) * magnitude;
};

// Map CSV headers to State keys
const KEY_MAP: Record<string, keyof SimulationState> = {
    'Reactivity': 'reactivity',
    'core_t': 'core_t',
    'pri_flow': 'pri_flow',
    'fw_flow': 'fw_flow',
    'fwcv_degree': 'fwcv_degree',
    'sg_level': 'sg_level',
    'steam_press': 'steam_press',
    'turbine_speed_cv': 'turbine_speed_cv',
    'turbine_load_cv': 'turbine_load_cv',
    'turbine_bypass_cv': 'turbine_bypass_cv',
    'turbine_rpm': 'turbine_rpm',
    'trip_turbine': 'trip_turbine',
    'all_rods_down': 'all_rods_down',
    'safety_injection_engaged': 'safety_injection_engaged',
    // Mappings for Annunciators acting as Controls in CSV logic
    'reactor_coolant_pump_trip': 'reactor_coolant_pump_trip',
    'fw_pump_trip': 'fw_pump_trip',
    'fw_low_flow': 'fw_low_flow',
    'core_temp_high': 'core_temp_high'
};

const INITIAL_STATE = {
  time: 0,
  tick_count: 0,
  last_log_time: 0,
  simulationEnded: false,

  // Reactor
  reactivity: 98.3,
  display_reactivity: 98.3,

  core_t: 370.0,
  display_core_t: 370.0,

  pri_flow: 1101,
  display_pri_flow: 1101,

  // SG
  fw_flow: 1054,
  display_fw_flow: 1054,

  fwcv_degree: 0.5,
  fwcv_continuous: 0.5,

  sg_level: 50.0,
  display_sg_level: 50.0,

  steam_press: 114.4,
  display_steam_press: 114.4,

  // Turbine
  turbine_speed_cv: 1.0,
  turbine_load_cv: 1.0,
  turbine_bypass_cv: 0.0,
  turbine_rpm: 1800,

  // Controls
  trip_reactor: false,
  activate_si: false,
  rcp: true,
  porviv: false,

  fwcv_mode: true, // Auto
  fwiv: true,
  msiv: true,
  fw_pump: true,

  trip_turbine: false,

  fault_active: false,

  // Annunciators (Init all false)
  rx_over_limit: false,
  high_temp_high_rx_trip: false,
  core_temp_high: false,
  cnmt_rad_monitor: false,
  safety_injection_engaged: false,
  core_temp_low: false,
  all_rods_down: false,
  reactor_coolant_pump_trip: false,
  low_primary_coolant: false,
  sg_high_level: false,
  ms_rad_monitor: false,
  sg_low_level: false,
  low_turbine_pressure: false,
  fw_low_flow: false,
  fw_pump_trip: false,
  turbine_trip: false,
  atmos_dump_active: false,
  ready_to_roll: false,
  ready_to_sync: false,
  not_latched: false,
  not_synced_to_grid: false,
};

export const useSimulationStore = create<SimulationState>((set, get) => ({
  ...INITIAL_STATE,
  scenarioPreset: 'hard',
  trainingMode: true,
  activeStepId: 'pc_st_01_01', // Start at Step 1.1
  stepHistory: [],

  procedureRules: [],
  triggeredRules: new Set(),
  activeTransitions: [],

  loadProcedureRules: async () => {
    try {
        const response = await fetch('/data/procedure_time.csv');
        const text = await response.text();
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());

        const rules: ProcedureRule[] = [];
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',');
            if (row.length < headers.length) continue;

            const updates: Record<string, string> = {};
            row.forEach((val, idx) => {
                const header = headers[idx];
                const cleanVal = val.trim();
                if (idx > 2 && cleanVal !== '') { // Skip after_action, scenario, status
                     updates[header] = cleanVal;
                }
            });

            rules.push({
                after_action: row[0].trim(),
                scenario: row[1].trim(),
                status: row[2].trim(),
                updates
            });
        }
        set({ procedureRules: rules });
        console.log('Loaded Procedure Rules:', rules.length);

        // Apply Initial State (rule where after_action === '0' or '0_0')
        const initRule = rules.find(r =>
            r.after_action === 'initial_value' && r.scenario === 'all'
            );
        if (initRule) {
            const updates: any = {};
            Object.entries(initRule.updates).forEach(([key, val]) => {
                const stateKey = KEY_MAP[key];
                if (!stateKey) return;

                if (val.toUpperCase() === 'TRUE') {
                    updates[stateKey] = true;
                    if (stateKey === 'reactor_coolant_pump_trip') updates['rcp'] = false;
                    if (stateKey === 'fw_pump_trip') updates['fw_pump'] = false;
                } else if (val.toUpperCase() === 'FALSE') {
                    updates[stateKey] = false;
                    if (stateKey === 'reactor_coolant_pump_trip') updates['rcp'] = true;
                    if (stateKey === 'fw_pump_trip') updates['fw_pump'] = true;
                } else {
                    const targetStr = val.startsWith('_') ? val.substring(1) : val;
                    const target = parseFloat(targetStr);
                    if (!isNaN(target)) {
                        updates[stateKey] = target;
                        if (stateKey === 'fwcv_degree') {
                            updates['fwcv_continuous'] = target;
                        }
                    }
                }
            });
            console.log("Applied Initial State from CSV:", updates);
            set(updates);
        }

        // Trigger 10sec Transition immediately (starts at t=0, lasts 10s)
        const s = get();
        s.triggerStepAction('10sec');

    } catch (e) {
        console.error('Failed to load procedure rules:', e);
    }
  },

  triggerStepAction: (stepId: string) => {
      const s = get();
      const scenarioMap: Record<ScenarioPreset, string> = { 'cv': 'A', 'pump': 'B', 'hard': 'C' };
      const currentScenarioChar = scenarioMap[s.scenarioPreset];

      // Helper to match step IDs (e.g. pc_st_01_01 matches 1_1)
      const normalizeId = (id: string) => {
          if (id === '5sec') return '5sec';
          // Extract numbers from pc_st_XX_YY
          const match = id.match(/pc_st_(\d+)_(\d+)/);  
          if (match) {
              const major = parseInt(match[1], 10);
              const minor = parseInt(match[2], 10);
              return `${major}_${minor}`;
          }
          return id;
      };

      // Try exact match first, then normalized
      let matchingRules = s.procedureRules.filter(r =>
          (r.after_action === stepId || r.after_action === normalizeId(stepId)) &&
          (r.scenario === 'all' || r.scenario === currentScenarioChar)
      );

      if (matchingRules.length === 0) return;

      logger.logAction('TRIGGER_RULE', { step: stepId, count: matchingRules.length });

      let newTransitions = [...s.activeTransitions];
      const updates: Partial<SimulationState> = {};
      let ended = false;

      matchingRules.forEach(rule => {
          // if (rule.status.toLowerCase() === 'end') {
          //     ended = true;
          // }

          Object.entries(rule.updates).forEach(([key, val]) => {
              const stateKey = KEY_MAP[key];
              if (!stateKey) return;

              // Handle Booleans
              if (val.toUpperCase() === 'TRUE') {
                  (updates as any)[stateKey] = true;
                  // Side effects for special controls
                  if (stateKey === 'reactor_coolant_pump_trip') (updates as any)['rcp'] = false;
                  if (stateKey === 'fw_pump_trip') (updates as any)['fw_pump'] = false;
              } else if (val.toUpperCase() === 'FALSE') {
                  (updates as any)[stateKey] = false;
                  if (stateKey === 'reactor_coolant_pump_trip') (updates as any)['rcp'] = true;
                  if (stateKey === 'fw_pump_trip') (updates as any)['fw_pump'] = true;
              } else {
                  // Handle Numbers / Transitions
                  let duration = 3.0;
                  let targetStr = val;
                  if (val.startsWith('_')) {
                      duration = 5.0;
                      targetStr = val.substring(1);
                  }

                  // Special Case: 10sec trigger has 10s duration
                  if (stepId === '10sec') {
                      duration = 10.0;
                  }

                  const target = parseFloat(targetStr);
                  if (!isNaN(target)) {
                      // Remove existing transition for this var
                      newTransitions = newTransitions.filter(t => t.varName !== stateKey);

                      // Add new transition
                      const startVal = typeof s[stateKey] === 'number' ? s[stateKey] as number : target;
                      newTransitions.push({
                          varName: stateKey,
                          startVal: startVal,
                          targetVal: target,
                          startTime: s.time,
                          duration: duration
                      });
                  }
              }
          });
      });

      set(state => ({
          ...updates,
          activeTransitions: newTransitions,
          simulationEnded: state.simulationEnded || ended
      }));
  },

  setActiveStepId: (id) => {
      const s = get();
      if (id) {
          s.triggerStepAction(id);
      }
      set((state) => {
          const history = state.activeStepId ? [...state.stepHistory, state.activeStepId] : state.stepHistory;
          return { activeStepId: id, stepHistory: history };
      });
  },

  goToPreviousStep: () => set((state) => {
      if (state.stepHistory.length === 0) return {};
      const newHistory = [...state.stepHistory];
      const prevStep = newHistory.pop();
      return { activeStepId: prevStep || null, stepHistory: newHistory };
  }),

  setScenarioPreset: (preset) => set((state) => {
    // If Training Mode is ON, force Scenario C (hard) and ignore user selection
    if (state.trainingMode) {
        return {
        scenarioPreset: 'hard',
        ...INITIAL_STATE,
        activeStepId: 'pc_st_01_01',
        stepHistory: []
        };
    }

    // If Training Mode is OFF, allow user-selected scenario (A/B/C)
    return {
        scenarioPreset: preset,
        ...INITIAL_STATE,
        activeStepId: 'pc_st_01_01',
        stepHistory: []
    };
    }),

    toggleTrainingMode: () => set((state) => {
    const newMode = !state.trainingMode;

    // When turning Training Mode ON, force Scenario C (hard)
    if (newMode) {
        return {
        trainingMode: true,
        scenarioPreset: 'hard'
        };
    }

    // When turning Training Mode OFF, keep current scenario and allow manual selection
    return {
        trainingMode: false
    };
    }),

  resetSimulation: () => {
    const s = get();
    // Re-trigger load if needed, or just reset state
    set({
        ...INITIAL_STATE,
        scenarioPreset: s.scenarioPreset,
        trainingMode: s.trainingMode,
        activeStepId: 'pc_st_01_01',
        stepHistory: [],
        procedureRules: s.procedureRules, // Keep loaded rules
        triggeredRules: new Set(),
        activeTransitions: []
    });
  },

  // --- Actions ---
  toggleTripReactor: () => {
      const newVal = !get().trip_reactor;
      logger.logAction('TOGGLE_TRIP_REACTOR', { target: 'trip_reactor', value: newVal });
      set({ trip_reactor: newVal });
  },
  toggleSi: () => {
      const newVal = !get().activate_si;
      logger.logAction('TOGGLE_SI', { target: 'activate_si', value: newVal });
      set({ activate_si: newVal });
  },
  toggleRcp: () => {
      const newVal = !get().rcp;
      logger.logAction('TOGGLE_RCP', { target: 'rcp', value: newVal });
      set({ rcp: newVal });
  },
  togglePorv: () => {
      const newVal = !get().porviv;
      logger.logAction('TOGGLE_PORV', { target: 'porviv', value: newVal });
      set({ porviv: newVal });
  },
  toggleFwcvMode: () => {
      const newVal = !get().fwcv_mode;
      logger.logAction('TOGGLE_FWCV_MODE', { target: 'fwcv_mode', value: newVal ? 'Auto' : 'Manual' });
      set({ fwcv_mode: newVal });
  },
  setFwcvDegree: (val) => {
      if (!get().fwcv_mode) {
        const steppedVal = Math.round(val * 10) / 10;
        logger.logAction('SET_FWCV_DEGREE', { target: 'fwcv_degree', value: steppedVal });
        set({ fwcv_degree: steppedVal, fwcv_continuous: steppedVal });
      }
  },
  toggleFwiv: () => {
      const newVal = !get().fwiv;
      logger.logAction('TOGGLE_FWIV', { target: 'fwiv', value: newVal });
      set({ fwiv: newVal });
  },
  toggleMsiv: () => {
      const newVal = !get().msiv;
      logger.logAction('TOGGLE_MSIV', { target: 'msiv', value: newVal });
      set({ msiv: newVal });
  },
  toggleFwPump: () => {
      const newVal = !get().fw_pump;
      logger.logAction('TOGGLE_FW_PUMP', { target: 'fw_pump', value: newVal });
      set({ fw_pump: newVal });
  },
  toggleTripTurbine: () => {
      const newVal = !get().trip_turbine;
      logger.logAction('TOGGLE_TRIP_TURBINE', { target: 'trip_turbine', value: newVal });
      set({ trip_turbine: newVal });
  },
  setTurbineSpeedCv: (val) => {
      const steppedVal = Math.round(val * 10) / 10;
      logger.logAction('SET_TURB_SPEED_CV', { target: 'turbine_speed_cv', value: steppedVal });
      set({ turbine_speed_cv: steppedVal });
  },
  setTurbineLoadCv: (val) => {
      const steppedVal = Math.round(val * 10) / 10;
      logger.logAction('SET_TURB_LOAD_CV', { target: 'turbine_load_cv', value: steppedVal });
      set({ turbine_load_cv: steppedVal });
  },
  setTurbineBypassCv: (val) => {
      const steppedVal = Math.round(val * 10) / 10;
      logger.logAction('SET_TURB_BYPASS_CV', { target: 'turbine_bypass_cv', value: steppedVal });
      set({ turbine_bypass_cv: steppedVal });
  },

  // --- Physics Tick ---
  tick: () => {
    const s = get();
    let updates: Partial<SimulationState> = {};
    const new_time = s.time + DT;
    const new_tick_count = s.tick_count + 1;

    updates.time = new_time;
    updates.tick_count = new_tick_count;

    const shouldUpdateDisplay = (new_tick_count % 10 === 0);

    // --- Rules: Time-based Triggers ---
    // 10sec rule is now triggered at start via loadProcedureRules.
    // We just need to ensure fault_active is set eventually if needed.
    if (new_time >= 10.0 && !s.fault_active) {
        updates.fault_active = true;
    }

    // 1. Reactor Logic
    let target_reactivity = s.reactivity;
    const reactivity_change = (target_reactivity - s.reactivity) * 0.1;
    // Clamp reactivity 0-100
    const new_reactivity = Math.max(0, Math.min(100, s.reactivity + reactivity_change));

    // RCP 
    const new_pri_flow = s.pri_flow;

    // Core Temp Logic
    const flow_factor = 1.0;
    let target_core_t = 330.68 + (new_reactivity * 0.4) / flow_factor;
    target_core_t = Math.min(400, Math.max(20, target_core_t));
    const new_core_t = s.core_t + (target_core_t - s.core_t) * 0.02;

    // 2. Feedwater Logic
    let new_fwcv_degree = s.fwcv_degree;
    let new_fwcv_continuous = s.fwcv_continuous;
    let auto_correction = 0;

    // Auto Mode Logic
    if (s.fwcv_mode) {
        const error = 50.0 - s.sg_level;
        auto_correction = error * 0.005;

        // Note: Old 'fault_active' logic removed in favor of CSV rules.
        // Unless we want to keep specific behavior for 'cv' drift that isn't in CSV?
        // CSV 5sec for A (CV) does NOT set fwcv values.
        // So we might need to keep the "physics drift" behavior if it's considered "physics" of the fault.
        // The Prompt says "status updates" from CSV.
        // If the CSV doesn't specify FWCV drift, we assume it's implicit or missing.
        // I will keep the Auto drift logic for now as it makes the scenario interesting.
        if (s.fault_active && s.scenarioPreset === 'cv') {
             auto_correction = -0.01;
        }

        new_fwcv_continuous = Math.max(0, Math.min(1, s.fwcv_continuous + auto_correction));
        new_fwcv_degree = Math.round(new_fwcv_continuous * 10) / 10;
    }

    // Pump Logic
    const pump_on = s.fw_pump;
    // Note: Pump trip is now handled via CSV rule setting 'fw_pump_trip' -> 'fw_pump' = false.

    // Flow Calculation
    let avail_pump_head = pump_on ? 2108 : 0;
    if (!s.fwiv) avail_pump_head = 0;

    // Hard failure flow factor
    let flow_factor_fault = 1.0;
    if (s.fault_active && s.scenarioPreset === 'hard') {
        flow_factor_fault = 0.0;
    }

    const target_fw_flow = avail_pump_head * new_fwcv_degree * flow_factor_fault;
    let new_fw_flow = s.fw_flow + (target_fw_flow - s.fw_flow) * 0.1;
    new_fw_flow = Math.max(0, new_fw_flow);

    // 3. SG Logic
    let steam_out = (new_reactivity / 98.3) * 1054;
    if (!s.msiv) steam_out = 0;

    const mass_balance = new_fw_flow - steam_out;
    let new_sg_level = s.sg_level + mass_balance * 0.005 * DT;
    new_sg_level = Math.max(0, Math.min(100, new_sg_level));

    // Pressure Logic
    let target_press = 114.4;
    if (!s.msiv && new_reactivity > 0) target_press = 75.0;
    if (new_reactivity < 10) target_press = 40.0 + new_reactivity;
    const new_press = s.steam_press + (target_press - s.steam_press) * 0.05;

    // 4. Turbine Logic
    let target_rpm = 1800 - 1800 * (1-s.turbine_speed_cv) * 0.2;
    if (s.trip_turbine) target_rpm = 0;
    target_rpm = target_rpm * (1 - s.turbine_load_cv * 0.1);
    const new_rpm = s.turbine_rpm + (target_rpm - s.turbine_rpm) * 0.01;

    // --- Update Physics Values ---
    updates = {
        ...updates,
        reactivity: new_reactivity,
        pri_flow: new_pri_flow,
        core_t: new_core_t,
        fw_flow: new_fw_flow,
        fwcv_degree: new_fwcv_degree,
        fwcv_continuous: new_fwcv_continuous,
        sg_level: new_sg_level,
        steam_press: new_press,
        turbine_rpm: new_rpm,
    };

    // --- Apply Active Transitions (Overriding Physics) ---
    if (s.activeTransitions.length > 0) {
        const remainingTransitions: ActiveTransition[] = [];
        s.activeTransitions.forEach(t => {
            const elapsed = new_time - t.startTime;
            if (elapsed < t.duration) {
                const progress = elapsed / t.duration;
                // Linear interpolation
                const currentVal = t.startVal + (t.targetVal - t.startVal) * progress;
                (updates as any)[t.varName] = currentVal;
                remainingTransitions.push(t);
            } else {
                // Finished
                (updates as any)[t.varName] = t.targetVal;
            }
        });
        updates.activeTransitions = remainingTransitions;
    }

    if (shouldUpdateDisplay) {
        // Clamp display reactivity 0-100
        const raw_reactivity = addNoise(updates.reactivity ?? new_reactivity, 0.5);
        updates.display_reactivity = Math.max(0, Math.min(100, raw_reactivity));

        updates.display_pri_flow = addNoise(updates.pri_flow ?? new_pri_flow, 10);
        updates.display_core_t = addNoise(updates.core_t ?? new_core_t, 1.0);

        const raw_fw_display = addNoise(updates.fw_flow ?? new_fw_flow, 10);
        updates.display_fw_flow = Math.max(0, raw_fw_display);

        const raw_sg_display = addNoise(updates.sg_level ?? new_sg_level, 0.5);
        updates.display_sg_level = Math.max(0, raw_sg_display);

        updates.display_steam_press = addNoise(updates.steam_press ?? new_press, 0.5);
    }

    // --- Annunciator Logic ---
    // Note: We use the 'updates' values (which might have been overridden by transitions)
    const final_reactivity = updates.reactivity ?? new_reactivity;
    const final_core_t = updates.core_t ?? new_core_t;
    const final_pri_flow = updates.pri_flow ?? new_pri_flow;
    const final_sg_level = updates.sg_level ?? new_sg_level;
    const final_fw_flow = updates.fw_flow ?? new_fw_flow;
    const final_press = updates.steam_press ?? new_press;
    const final_rpm = updates.turbine_rpm ?? new_rpm;

    // Primary
    updates.rx_over_limit = final_reactivity > 102;
    updates.core_temp_high = final_core_t > 400;
    updates.high_temp_high_rx_trip = updates.core_temp_high;
    updates.core_temp_low = final_core_t < 270 && final_reactivity > 10;
    updates.low_primary_coolant = final_pri_flow < 40000;
    updates.reactor_coolant_pump_trip = !s.rcp;
    updates.safety_injection_engaged = s.activate_si;
    updates.cnmt_rad_monitor = false;

    // Secondary
    updates.sg_high_level = final_sg_level > 80;
    updates.sg_low_level = final_sg_level < 30;
    updates.fw_low_flow = final_fw_flow < 500 && final_reactivity > 10;
    updates.fw_pump_trip = !pump_on;
    updates.low_turbine_pressure = final_press < 40;
    updates.ms_rad_monitor = false;

    // Turbine
    updates.turbine_trip = s.trip_turbine;
    updates.ready_to_roll = !s.trip_turbine && final_rpm < 100;
    updates.ready_to_sync = final_rpm > 1750 && final_rpm < 1850;
    updates.not_synced_to_grid = !updates.ready_to_sync;
    updates.atmos_dump_active = s.turbine_bypass_cv > 0.1;
    updates.not_latched = s.trip_turbine;

    // Snapshot Logging
    if (Date.now() - s.last_log_time >= 1000) {
        updates.last_log_time = Date.now();
        logger.logSnapshot({ ...s, ...updates });
    }

    set(updates);
  }
}));
