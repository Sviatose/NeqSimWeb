import { type DragEvent, FormEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Step = 'project' | 'model' | 'components' | 'workspace';

type ProjectResponse = {
  projectId: string;
  projectName: string;
  folderPath: string;
};

type FluidResponse = {
  fluidName: string;
  folderPath: string;
  model: string;
  components: string[];
};

interface StreamConfig {
  name: string;
  flowRate: string;
  flowRateUnit: string;
  pressure: string;
  pressureUnit: string;
  temperature: string;
  temperatureUnit: string;
  composition: Record<string, string>;
}

interface DroppedUnit {
  id: string;
  type: string;
  varName: string;
  x: number;
  y: number;
  configured: boolean;
  config?: StreamConfig;
  cloneSource?: string;
  configSnapshot?: string;
}

const fluidModels = ['PR', 'SRK', 'CPA', 'GERG-2008', 'PC-SAFT'];

const componentsCatalog = [
  { code: 'CH4', name: 'Methane', neqsimName: 'methane' },
  { code: 'C2H6', name: 'Ethane', neqsimName: 'ethane' },
  { code: 'C3H8', name: 'Propane', neqsimName: 'propane' },
  { code: 'nC4', name: 'n-Butane', neqsimName: 'n-butane' },
  { code: 'iC4', name: 'i-Butane', neqsimName: 'i-butane' },
  { code: 'N2', name: 'Nitrogen', neqsimName: 'nitrogen' },
  { code: 'CO2', name: 'Carbon dioxide', neqsimName: 'CO2' },
  { code: 'H2O', name: 'Water', neqsimName: 'water' }
];

const codeToNeqsimName: Record<string, string> = Object.fromEntries(
  componentsCatalog.map((c) => [c.code, c.neqsimName])
);

const modelClassMap: Record<string, string> = {
  PR: 'SystemPrEos',
  SRK: 'SystemSrkEos',
  CPA: 'SystemCPAEos',
  'GERG-2008': 'SystemGERG2004Eos',
  'PC-SAFT': 'SystemPCSAFTEos'
};

const unitOperations: { name: string; icon: ReactNode }[] = [
  {
    name: 'Separator',
    icon: (
      <svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Vertical vessel */}
        <rect x="10" y="3" width="20" height="34" rx="10" />
        {/* Liquid level line */}
        <line x1="10" y1="24" x2="30" y2="24" strokeDasharray="3 2" />
        {/* Inlet nozzle */}
        <line x1="2" y1="14" x2="10" y2="14" />
        {/* Gas outlet top */}
        <line x1="20" y1="3" x2="20" y2="0" />
        <circle cx="20" cy="0" r="0" />
        {/* Liquid outlet bottom */}
        <line x1="20" y1="37" x2="20" y2="40" />
      </svg>
    )
  },
  {
    name: 'Mixer',
    icon: (
      <svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Tee junction */}
        <line x1="4" y1="12" x2="20" y2="20" />
        <line x1="4" y1="28" x2="20" y2="20" />
        <line x1="20" y1="20" x2="36" y2="20" />
        <circle cx="20" cy="20" r="6" />
      </svg>
    )
  },
  {
    name: 'Compressor',
    icon: (
      <svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Trapezoid body - narrowing shape */}
        <polygon points="6,6 34,14 34,26 6,34" />
        {/* Inlet */}
        <line x1="0" y1="20" x2="6" y2="20" />
        {/* Outlet */}
        <line x1="34" y1="20" x2="40" y2="20" />
        {/* Motor circle */}
        <circle cx="20" cy="4" r="3" />
        <line x1="20" y1="7" x2="20" y2="12" />
      </svg>
    )
  },
  {
    name: 'Pump',
    icon: (
      <svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Pump circle */}
        <circle cx="18" cy="22" r="12" />
        {/* Discharge nozzle going up-right */}
        <line x1="26" y1="14" x2="36" y2="6" />
        <line x1="36" y1="6" x2="36" y2="0" />
        {/* Suction nozzle */}
        <line x1="0" y1="22" x2="6" y2="22" />
        {/* Triangle pointer inside */}
        <polygon points="12,16 24,22 12,28" fill="currentColor" opacity="0.25" />
      </svg>
    )
  },
  {
    name: 'Valve',
    icon: (
      <svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Bowtie shape */}
        <polygon points="6,10 20,20 6,30" />
        <polygon points="34,10 20,20 34,30" />
        {/* Stem */}
        <line x1="20" y1="20" x2="20" y2="6" />
        {/* Handwheel */}
        <line x1="14" y1="6" x2="26" y2="6" />
        {/* Inlet / outlet pipes */}
        <line x1="0" y1="20" x2="6" y2="20" />
        <line x1="34" y1="20" x2="40" y2="20" />
      </svg>
    )
  },
  {
    name: 'Heat Exchanger',
    icon: (
      <svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Shell */}
        <circle cx="20" cy="20" r="14" />
        {/* Tube-side S-curve */}
        <path d="M6 20 Q13 10 20 20 Q27 30 34 20" />
        {/* Shell-side nozzles */}
        <line x1="20" y1="6" x2="20" y2="0" />
        <line x1="20" y1="34" x2="20" y2="40" />
        {/* Tube-side nozzles */}
        <line x1="0" y1="20" x2="6" y2="20" />
        <line x1="34" y1="20" x2="40" y2="20" />
      </svg>
    )
  },
  {
    name: 'Stream',
    icon: (
      <svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Pipe line */}
        <line x1="4" y1="20" x2="28" y2="20" strokeWidth="2" />
        {/* Arrow head */}
        <polygon points="28,14 38,20 28,26" fill="currentColor" />
      </svg>
    )
  },
  {
    name: 'Recycle',
    icon: (
      <svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Circular arrow */}
        <path d="M30 20 A10 10 0 1 1 20 10" strokeWidth="2" />
        {/* Arrow tip */}
        <polygon points="18,4 22,10 14,10" fill="currentColor" />
        {/* R label */}
        <text x="16" y="25" fontSize="10" fontWeight="bold" fill="currentColor" stroke="none">R</text>
      </svg>
    )
  }
];

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

export default function App() {
  const [step, setStep] = useState<Step>('project');
  const [projectName, setProjectName] = useState('');
  const [selectedModel, setSelectedModel] = useState(fluidModels[0]);
  const [availableComponents, setAvailableComponents] = useState(componentsCatalog);
  const [selectedComponents, setSelectedComponents] = useState<typeof componentsCatalog>([]);
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [fluid, setFluid] = useState<FluidResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [existingProjects, setExistingProjects] = useState<{ projectId: string; projectName: string }[]>([]);
  const [droppedUnits, setDroppedUnits] = useState<DroppedUnit[]>([]);
  const [editingUnit, setEditingUnit] = useState<DroppedUnit | null>(null);
  const [editForm, setEditForm] = useState<StreamConfig>({
    name: '', flowRate: '', flowRateUnit: 'kg/hr',
    pressure: '', pressureUnit: 'bara',
    temperature: '', temperatureUnit: 'C',
    composition: {}
  });
  const [dragOver, setDragOver] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<Record<string, any> | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<'composition' | 'fractions' | 'properties'>('composition');
  const [editModalTab, setEditModalTab] = useState<'settings' | 'results'>('settings');
  const [resFlowUnit, setResFlowUnit] = useState<'mol/s' | 'kg/s' | 'kg/hr'>('mol/s');
  const [resTempUnit, setResTempUnit] = useState<'C' | 'K'>('C');
  const [resPressUnit, setResPressUnit] = useState<'bara' | 'kPa' | 'MPa' | 'psi'>('bara');
  const [resViscUnit, setResViscUnit] = useState<'Pa·s' | 'cP'>('Pa·s');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [copiedUnit, setCopiedUnit] = useState<DroppedUnit | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const undoStackRef = useRef<DroppedUnit[][]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<{
    type: 'none' | 'pan' | 'drag';
    startX: number; startY: number;
    startPanX: number; startPanY: number;
    unitId: string | null;
    startUnitX: number; startUnitY: number;
    moved: boolean;
  }>({ type: 'none', startX: 0, startY: 0, startPanX: 0, startPanY: 0, unitId: null, startUnitX: 0, startUnitY: 0, moved: false });

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setExistingProjects(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const openExistingProject = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
      const proj = await readJson<{ projectId: string; projectName: string; folderPath: string; fluid?: FluidResponse; workspace?: any }>(res);
      setProject({ projectId: proj.projectId, projectName: proj.projectName, folderPath: proj.folderPath });
      if (proj.fluid) {
        setFluid(proj.fluid);
        setSelectedModel(proj.fluid.model);
        const codes = proj.fluid.components;
        setSelectedComponents(componentsCatalog.filter((c) => codes.includes(c.code)));
        setAvailableComponents(componentsCatalog.filter((c) => !codes.includes(c.code)));
        if (proj.workspace) {
          const ws = proj.workspace;
          if (Array.isArray(ws.droppedUnits)) setDroppedUnits(ws.droppedUnits);
          if (ws.zoom != null) setZoom(ws.zoom);
          if (ws.panOffset) setPanOffset(ws.panOffset);
          if (ws.runResults) setRunResults(ws.runResults);
        }
        setStep('workspace');
      } else {
        setStep('model');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open project');
    } finally {
      setLoading(false);
    }
  };

  const canStart = projectName.trim().length > 0;
  const selectedCodes = useMemo(() => selectedComponents.map((component) => component.code), [selectedComponents]);

  const generatedCode = useMemo(() => {
    const cls = modelClassMap[selectedModel] ?? 'SystemSrkEos';
    const lines = [
      'from neqsim import jneqsim',
      '',
      `fluid_base = jneqsim.thermo.system.${cls}(273.15 + 15, 1.01325)`,
      ...selectedCodes.map((c) => `fluid_base.addComponent("${codeToNeqsimName[c] ?? c}", 1.0)`),
      'fluid_base.setMixingRule("Classic")',
      'fluid_base.setMultiPhaseCheck(True)',
      'fluid_base.useVolumeCorrection(True)',
      'fluid_base.init(0)',
      ''
    ];

    const streamVars: string[] = [];

    for (const unit of droppedUnits) {
      if (unit.type === 'Stream') {
        if (unit.configured && unit.config) {
          const c = unit.config;
          const safeName = c.name.replace(/\s+/g, '_').toLowerCase();
          const composVals = selectedCodes.map((code) => {
            const v = c.composition[code];
            return v !== undefined && v !== '' && parseFloat(v) > 0 ? v : '1.0E-100';
          });
          const cloneSrc = unit.cloneSource ? `${unit.cloneSource}_fluid` : 'fluid_base';
          lines.push(`${safeName}_fluid = ${cloneSrc}.clone()`);
          lines.push(`${safeName}_fluid.setMolarComposition([${composVals.join(', ')}])`);
          lines.push(`${safeName}_fluid.init(0)`);
          lines.push(`${safeName}_stream = jneqsim.process.equipment.stream.Stream("${c.name}", ${safeName}_fluid)`);
          if (c.flowRate) lines.push(`${safeName}_stream.setFlowRate(${c.flowRate}, "${c.flowRateUnit}")`);
          if (c.pressure) lines.push(`${safeName}_stream.setPressure(${c.pressure}, "${c.pressureUnit}")`);
          if (c.temperature) lines.push(`${safeName}_stream.setTemperature(${c.temperature}, "${c.temperatureUnit}")`);
          lines.push(`${safeName}_stream.run()`);
          streamVars.push(safeName);
        } else {
          lines.push(`${unit.varName} = jneqsim.process.equipment.stream.Stream("${unit.varName}", fluid_base)`);
        }
        lines.push('');
      }
    }

    return lines.join('\n').trimEnd();
  }, [selectedModel, selectedCodes, droppedUnits]);

  const executionCode = useMemo(() => {
    const streamVars: string[] = [];
    for (const unit of droppedUnits) {
      if (unit.type === 'Stream' && unit.configured && unit.config) {
        streamVars.push(unit.config.name.replace(/\s+/g, '_').toLowerCase());
      }
    }
    if (streamVars.length === 0) return generatedCode;

    const resultLines = [
      '',
      'import json',
      'results = {}'
    ];
    for (const sv of streamVars) {
      resultLines.push(`_fluid = ${sv}_stream.getFluid()`);
      resultLines.push(`_nphases = _fluid.getNumberOfPhases()`);
      resultLines.push(`_sr = {"numberOfPhases": _nphases, "phases": [], "pressure_bar": float(_fluid.getPressure("bara")), "pressure_Pa": float(_fluid.getPressure("Pa")), "temperature_C": float(_fluid.getTemperature("C")), "temperature_K": float(_fluid.getTemperature("K")), "totalFlowRate_mol_s": float(_fluid.getFlowRate("mole/sec")), "totalFlowRate_kg_s": float(_fluid.getFlowRate("kg/sec")), "totalFlowRate_kg_hr": float(_fluid.getFlowRate("kg/hr"))}`);
      resultLines.push('for _pi in range(_nphases):');
      resultLines.push('    _phase = _fluid.getPhase(_pi)');
      resultLines.push('    _pdata = {"phaseName": str(_phase.getPhaseTypeName()), "components": {}}');
      resultLines.push('    _pdata["flowRate_mole_per_sec"] = float(_phase.getFlowRate("mole/sec"))');
      resultLines.push('    _pdata["flowRate_kg_per_sec"] = float(_phase.getFlowRate("kg/sec"))');
      resultLines.push('    _pdata["flowRate_kg_per_hr"] = float(_phase.getFlowRate("kg/hr"))');
      resultLines.push('    _pdata["phaseFraction"] = float(_phase.getFlowRate("mole/sec") / _fluid.getFlowRate("mole/sec")) if _fluid.getFlowRate("mole/sec") != 0 else 0.0');
      resultLines.push('    try:');
      resultLines.push('        _pdata["density_kg_m3"] = float(_phase.getDensity("kg/m3"))');
      resultLines.push('    except Exception:');
      resultLines.push('        _pdata["density_kg_m3"] = None');
      resultLines.push('    try:');
      resultLines.push('        _pdata["molarMass_kg_mol"] = float(_phase.getMolarMass())');
      resultLines.push('    except Exception:');
      resultLines.push('        _pdata["molarMass_kg_mol"] = None');
      resultLines.push('    try:');
      resultLines.push('        _pdata["enthalpy_J_mol"] = float(_phase.getEnthalpy("J/mol"))');
      resultLines.push('    except Exception:');
      resultLines.push('        _pdata["enthalpy_J_mol"] = None');
      resultLines.push('    try:');
      resultLines.push('        _pdata["entropy_J_molK"] = float(_phase.getEntropy("J/molK"))');
      resultLines.push('    except Exception:');
      resultLines.push('        _pdata["entropy_J_molK"] = None');
      resultLines.push('    try:');
      resultLines.push('        _pdata["Cp_J_molK"] = float(_phase.getCp("J/molK"))');
      resultLines.push('    except Exception:');
      resultLines.push('        _pdata["Cp_J_molK"] = None');
      resultLines.push('    try:');
      resultLines.push('        _pdata["viscosity_Pa_s"] = float(_phase.getViscosity("kg/msec"))');
      resultLines.push('    except Exception:');
      resultLines.push('        _pdata["viscosity_Pa_s"] = None');
      resultLines.push('    try:');
      resultLines.push('        _pdata["Z"] = float(_phase.getZ())');
      resultLines.push('    except Exception:');
      resultLines.push('        _pdata["Z"] = None');
      resultLines.push('    for _ci in range(_phase.getNumberOfComponents()):');
      resultLines.push('        _comp = _phase.getComponent(_ci)');
      resultLines.push('        _pdata["components"][str(_comp.getComponentName())] = {"x": float(_comp.getx()), "z": float(_comp.getz())}');
      resultLines.push(`    _sr["phases"].append(_pdata)`);
      resultLines.push(`results["${sv}"] = _sr`);
      resultLines.push('');
    }
    resultLines.push('print("__NEQSIM_RESULTS_START__")');
    resultLines.push('print(json.dumps(results))');
    resultLines.push('print("__NEQSIM_RESULTS_END__")');
    return generatedCode + '\n' + resultLines.join('\n');
  }, [generatedCode, droppedUnits]);

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canStart) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName })
      });

      const payload = await readJson<ProjectResponse>(response);
      setProject(payload);
      setStep('model');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create project');
    } finally {
      setLoading(false);
    }
  };

  const moveComponent = (code: string, direction: 'left' | 'right') => {
    if (direction === 'right') {
      const component = availableComponents.find((item) => item.code === code);
      if (!component) {
        return;
      }

      setAvailableComponents((current) => current.filter((item) => item.code !== code));
      setSelectedComponents((current) => [...current, component]);
      return;
    }

    const component = selectedComponents.find((item) => item.code === code);
    if (!component) {
      return;
    }

    setSelectedComponents((current) => current.filter((item) => item.code !== code));
    setAvailableComponents((current) => [...current, component].sort((left, right) => left.code.localeCompare(right.code)));
  };

  const getNextVarName = useCallback((type: string) => {
    const base = type === 'Stream' ? 'stream_base' : type.toLowerCase().replace(/\s+/g, '_') + '_base';
    const existing = droppedUnits.filter((u) => u.type === type).length;
    return existing === 0 ? base : `${base}${existing}`;
  }, [droppedUnits]);

  const handleDragStart = (e: DragEvent<HTMLButtonElement>, unitName: string) => {
    e.dataTransfer.setData('text/plain', unitName);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const unitName = e.dataTransfer.getData('text/plain');
    if (!unitName) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - panOffset.x) / zoom;
    const y = (e.clientY - rect.top - panOffset.y) / zoom;
    const varName = getNextVarName(unitName);

    const newUnit: DroppedUnit = {
      id: `${unitName}-${Date.now()}`,
      type: unitName,
      varName,
      x, y,
      configured: false
    };
    pushUndo();
    setDroppedUnits((prev) => [...prev, newUnit]);
  };

  const openUnitConfig = (unit: DroppedUnit, tab?: 'settings' | 'results') => {
    setEditingUnit(unit);
    const initComposition: Record<string, string> = {};
    selectedCodes.forEach((c) => { initComposition[c] = unit.config?.composition[c] ?? ''; });
    setEditForm(unit.config ?? {
      name: unit.varName,
      flowRate: '', flowRateUnit: 'kg/hr',
      pressure: '', pressureUnit: 'bara',
      temperature: '', temperatureUnit: 'C',
      composition: initComposition
    });
    const key = unit.config?.name.replace(/\s+/g, '_').toLowerCase() ?? '';
    const hasRes = runResults && unit.configSnapshot && runResults[key];
    setEditModalTab(tab === 'results' && hasRes ? 'results' : (tab ?? 'settings'));
    setResultTab('composition');
  };

  const isNameValid = editForm.name !== '' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(editForm.name);
  const isCompositionValid = selectedCodes.some((code) => {
    const v = parseFloat(editForm.composition[code] ?? '');
    return !isNaN(v) && v > 0;
  });

  const pushUndo = useCallback(() => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), droppedUnits];
  }, [droppedUnits]);

  const saveUnitConfig = () => {
    if (!editingUnit || !isNameValid || !isCompositionValid) return;
    pushUndo();
    const newConfigStr = JSON.stringify(editForm);
    const oldSnapshot = editingUnit.configSnapshot;
    const configChanged = oldSnapshot !== newConfigStr;
    setDroppedUnits((prev) =>
      prev.map((u) =>
        u.id === editingUnit.id
          ? { ...u, configured: true, config: { ...editForm }, configSnapshot: configChanged ? undefined : u.configSnapshot }
          : u
      )
    );
    if (configChanged && runResults && editingUnit.config) {
      const oldKey = editingUnit.config.name.replace(/\s+/g, '_').toLowerCase();
      if (runResults[oldKey]) {
        const updated = { ...runResults };
        delete updated[oldKey];
        setRunResults(Object.keys(updated).length > 0 ? updated : null);
      }
    }
    setEditingUnit(null);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.3));
  const handleZoomReset = () => setZoom(1);

  const handleCanvasMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.dropped-unit')) return;
    setSelectedUnitId(null);
    interactionRef.current = {
      type: 'pan', startX: e.clientX, startY: e.clientY,
      startPanX: panOffset.x, startPanY: panOffset.y,
      unitId: null, startUnitX: 0, startUnitY: 0, moved: false,
    };
    setIsPanning(true);
  };

  const handleCanvasMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const ref = interactionRef.current;
    if (ref.type === 'none') return;
    const dx = e.clientX - ref.startX;
    const dy = e.clientY - ref.startY;
    if (!ref.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    ref.moved = true;
    if (ref.type === 'drag' && ref.unitId) {
      setDroppedUnits(prev => prev.map(u =>
        u.id === ref.unitId
          ? { ...u, x: ref.startUnitX + dx / zoom, y: ref.startUnitY + dy / zoom }
          : u
      ));
    } else if (ref.type === 'pan') {
      setPanOffset({ x: ref.startPanX + dx, y: ref.startPanY + dy });
    }
  };

  const handleCanvasMouseUp = () => {
    interactionRef.current.type = 'none';
    setIsPanning(false);
  };

  const handleUnitMouseDown = (e: MouseEvent<HTMLDivElement>, unit: DroppedUnit) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedUnitId(unit.id);
    interactionRef.current = {
      type: 'drag', startX: e.clientX, startY: e.clientY,
      startPanX: panOffset.x, startPanY: panOffset.y,
      unitId: unit.id, startUnitX: unit.x, startUnitY: unit.y, moved: false,
    };
  };

  const handleUnitDoubleClick = (e: MouseEvent<HTMLDivElement>, unit: DroppedUnit) => {
    e.stopPropagation();
    openUnitConfig(unit);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (step !== 'workspace') return;
      if (editingUnit) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        const stack = undoStackRef.current;
        if (stack.length > 0) {
          const prev = stack[stack.length - 1];
          undoStackRef.current = stack.slice(0, -1);
          setDroppedUnits(prev);
          setSelectedUnitId(null);
        }
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedUnitId) {
        e.preventDefault();
        undoStackRef.current = [...undoStackRef.current.slice(-49), droppedUnits];
        setDroppedUnits(prev => prev.filter(u => u.id !== selectedUnitId));
        setSelectedUnitId(null);
      }

      if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selectedUnitId) {
        const unit = droppedUnits.find(u => u.id === selectedUnitId);
        if (unit) setCopiedUnit({ ...unit });
      }

      if (e.key === 'v' && (e.ctrlKey || e.metaKey) && copiedUnit) {
        e.preventDefault();
        const canvas = canvasRef.current;
        let centerX = 200, centerY = 200;
        if (canvas) {
          centerX = (canvas.clientWidth / 2 - panOffset.x) / zoom;
          centerY = (canvas.clientHeight / 2 - panOffset.y) / zoom;
        }
        const sourceVarName = copiedUnit.config?.name?.replace(/\s+/g, '_').toLowerCase() ?? copiedUnit.varName;
        const copyName = sourceVarName + '_copy';
        const newUnit: DroppedUnit = {
          id: `${copiedUnit.type}-${Date.now()}`,
          type: copiedUnit.type,
          varName: copyName,
          x: centerX,
          y: centerY,
          configured: copiedUnit.configured,
          config: copiedUnit.config ? { ...copiedUnit.config, name: copyName, composition: { ...copiedUnit.config.composition } } : undefined,
          cloneSource: sourceVarName,
        };
        undoStackRef.current = [...undoStackRef.current.slice(-49), droppedUnits];
        setDroppedUnits(prev => [...prev, newUnit]);
        setSelectedUnitId(newUnit.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, selectedUnitId, droppedUnits, copiedUnit, panOffset, zoom, editingUnit]);

  // Auto-save workspace state to server (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (step !== 'workspace' || !project) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const payload = {
        droppedUnits,
        zoom,
        panOffset,
        runResults,
        savedAt: new Date().toISOString()
      };
      fetch(`/api/projects/${encodeURIComponent(project.projectId)}/workspace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [step, project, droppedUnits, zoom, panOffset, runResults]);

  const runSimulation = async () => {
    if (!project) return;
    setRunning(true);
    setRunResults(null);
    setRunError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.projectId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: executionCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Run failed');
      if (data.results) {
        setRunResults(data.results);
        setDroppedUnits((prev) =>
          prev.map((u) => {
            if (u.type === 'Stream' && u.configured && u.config) {
              const key = u.config.name.replace(/\s+/g, '_').toLowerCase();
              if (data.results[key]) {
                return { ...u, configSnapshot: JSON.stringify(u.config) };
              }
            }
            return u;
          })
        );
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setRunning(false);
    }
  };

  const configureFluid = async () => {
    if (!project || selectedCodes.length === 0) {
      setError('Select at least one component before starting.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project.projectId}/fluid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, components: selectedCodes })
      });

      const payload = await readJson<FluidResponse>(response);
      setFluid(payload);
      setStep('workspace');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to configure fluid');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      {step !== 'workspace' ? (
        <main className="onboarding-shell">
          <header className="brand-bar">
            <div>
              <p className="eyebrow">NeqSim browser studio</p>
              <h1>Build thermodynamic projects in the browser.</h1>
            </div>
            <div className="step-indicator">Step {step === 'project' ? '1' : step === 'model' ? '2' : '3'} of 3</div>
          </header>

          <section className="wizard-card">
            {step === 'project' && (
              <div className="step-grid">
                <div className="hero-panel">
                  <button className="plus-card" type="button" aria-label="Create a new project">
                    <span>+</span>
                  </button>
                  <div>
                    <h2>Create a new process project</h2>
                    <p>
                      Start from a clean white workspace, define the case name, then configure the base fluid model and components.
                    </p>
                  </div>
                </div>

                <form className="form-panel" onSubmit={createProject}>
                  <label htmlFor="project-name">Project name</label>
                  <input
                    id="project-name"
                    placeholder="Example: North Sea Separation Train"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                  <p className="hint">A matching folder will be created on the server when you continue.</p>
                  <button className="primary-action" disabled={!canStart || loading} type="submit">
                    {loading ? 'Creating project...' : 'Create project'}
                  </button>

                  {existingProjects.length > 0 && (
                    <div className="existing-projects">
                      <p className="eyebrow" style={{ marginTop: 16 }}>Or open an existing project</p>
                      <div className="project-list">
                        {existingProjects.map((p) => (
                          <button
                            key={p.projectId}
                            type="button"
                            className="project-card"
                            disabled={loading}
                            onClick={() => openExistingProject(p.projectId)}
                          >
                            <strong>{p.projectName}</strong>
                            <span>{p.projectId}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </form>
              </div>
            )}

            {step === 'model' && (
              <div className="single-panel">
                <h2>Select the fluid model</h2>
                <p>The backend will create a fluid definition area for the selected thermodynamic package.</p>
                <div className="model-grid">
                  {fluidModels.map((model) => (
                    <button
                      key={model}
                      className={model === selectedModel ? 'model-card active' : 'model-card'}
                      type="button"
                      onClick={() => setSelectedModel(model)}
                    >
                      <strong>{model}</strong>
                      <span>{model === 'PR' ? 'Peng-Robinson' : model === 'SRK' ? 'Soave-Redlich-Kwong' : 'Advanced package'}</span>
                    </button>
                  ))}
                </div>
                <div className="footer-actions">
                  <button className="secondary-action" type="button" onClick={() => setStep('project')}>
                    Back
                  </button>
                  <button className="primary-action" type="button" onClick={() => setStep('components')}>
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 'components' && (
              <div className="single-panel">
                <h2>Select components</h2>
                <p>Move compounds from the catalog on the left to the selected fluid composition on the right.</p>

                <div className="transfer-layout">
                  <div className="transfer-panel">
                    <div className="transfer-header">
                      <h3>Available</h3>
                    </div>
                    <div className="component-list">
                      {availableComponents.map((component) => (
                        <button key={component.code} type="button" className="component-card" onClick={() => moveComponent(component.code, 'right')}>
                          <strong>{component.code}</strong>
                          <span>{component.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="transfer-arrow">→</div>

                  <div className="transfer-panel selected-panel">
                    <div className="transfer-header">
                      <h3>Fluid Base</h3>
                      <span>{selectedCodes.length} selected</span>
                    </div>
                    <div className="component-list">
                      {selectedComponents.length > 0 ? (
                        selectedComponents.map((component) => (
                          <button key={component.code} type="button" className="component-card selected" onClick={() => moveComponent(component.code, 'left')}>
                            <strong>{component.code}</strong>
                            <span>{component.name}</span>
                          </button>
                        ))
                      ) : (
                        <div className="empty-state">Choose at least CH4 and C2H6 to initialize the fluid.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="footer-actions">
                  <button className="secondary-action" type="button" onClick={() => setStep('model')}>
                    Back
                  </button>
                  <button className="primary-action" disabled={loading || selectedCodes.length === 0} type="button" onClick={configureFluid}>
                    {loading ? 'Starting...' : 'Start project'}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="error-banner">{error}</p>}
          </section>
        </main>
      ) : (
        <main className="workspace-shell">
          <section className="workspace-topbar">
            <div>
              <p className="eyebrow">Active project</p>
              <h2>{project?.projectName}</h2>
            </div>
            <div className="topbar-right">
              <button className="primary-action" type="button" onClick={runSimulation} disabled={running || droppedUnits.filter(u => u.configured).length === 0} style={{ padding: '8px 20px', fontSize: '0.85rem' }}>
                {running ? 'Running...' : '▶ Run'}
              </button>
              <button className="code-toggle" type="button" onClick={() => setShowCode((v) => !v)}>
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="7,4 2,10 7,16" />
                  <polyline points="13,4 18,10 13,16" />
                </svg>
                {showCode ? 'Hide Code' : 'View Code'}
              </button>
            </div>
          </section>

          {runError && (
            <div className="run-error-banner">
              <span><strong>Simulation Error:</strong> {runError}</span>
              <button type="button" onClick={() => setRunError(null)} aria-label="Dismiss">×</button>
            </div>
          )}

          {!running && runResults && !runError && (
            <div className="run-success-banner">
              <span>✓ Simulation completed successfully. Click <strong>Results</strong> on a stream to view output.</span>
              <button type="button" onClick={() => setRunResults(null)} aria-label="Dismiss">×</button>
            </div>
          )}

          <section className={showCode ? 'workspace-body workspace-body--with-code' : 'workspace-body'}>
            <div className="canvas-panel">
              <div className="canvas-header">
                <div>
                  <h3>Flowsheet</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="zoom-controls">
                    <button type="button" onClick={handleZoomOut} title="Zoom out">−</button>
                    <button type="button" onClick={handleZoomReset} title="Reset zoom">{Math.round(zoom * 100)}%</button>
                    <button type="button" onClick={handleZoomIn} title="Zoom in">+</button>
                  </div>
                </div>
              </div>

              <div
                ref={canvasRef}
                className={`canvas-grid${dragOver ? ' canvas-grid--drag-over' : ''}${isPanning ? ' canvas-grid--panning' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              >
                <div style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}>
                <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: `${100 / zoom}%`, height: `${100 / zoom}%`, position: 'relative' }}>
                {droppedUnits.map((unit) => {
                  const opDef = unitOperations.find((o) => o.name === unit.type);
                  const hasResults = runResults && unit.configured && unit.config && unit.configSnapshot && runResults[unit.config.name.replace(/\s+/g, '_').toLowerCase()];
                  return (
                    <div
                      key={unit.id}
                      className={`dropped-unit${unit.type === 'Stream' ? (hasResults ? ' dropped-stream--success' : ' dropped-stream') : ''}${unit.configured ? ' dropped-configured' : ''}${selectedUnitId === unit.id ? ' dropped-unit--selected' : ''}`}
                      style={{ left: unit.x - 40, top: unit.y - 30 }}
                      onMouseDown={(e) => handleUnitMouseDown(e, unit)}
                      onDoubleClick={(e) => handleUnitDoubleClick(e, unit)}
                      title={unit.configured && unit.config ? unit.config.name : unit.varName}
                    >
                      {opDef?.icon}
                      <span className="dropped-label">{unit.configured && unit.config ? unit.config.name : unit.varName}</span>
                    </div>
                  );
                })}
                {droppedUnits.length === 0 && (
                  <div className="canvas-drop-hint">Drag units from the right and drop here</div>
                )}
                </div>
                </div>
              </div>
            </div>

            <aside className="unit-sidebar">
              <div className="unit-list">
                {unitOperations.map((unit) => (
                  <button
                    key={unit.name}
                    type="button"
                    className="unit-card"
                    title={unit.name}
                    draggable
                    onDragStart={(e) => handleDragStart(e, unit.name)}
                  >
                    {unit.icon}
                    <span className="unit-label">{unit.name}</span>
                  </button>
                ))}
              </div>
            </aside>

            {showCode && (
              <aside className="code-side-panel">
                <div className="code-side-header">
                  <h3>Generated Code</h3>
                  <button className="code-close" type="button" onClick={() => setShowCode(false)} aria-label="Close">×</button>
                </div>
                <pre><code>{generatedCode}</code></pre>
              </aside>
            )}
          </section>

          {editingUnit && (() => {
            const editKey = editingUnit.config?.name.replace(/\s+/g, '_').toLowerCase() ?? '';
            const unitResults = runResults && editingUnit.configSnapshot && runResults[editKey] ? runResults[editKey] : null;
            return (
            <div className="modal-backdrop" onClick={() => setEditingUnit(null)}>
              <div className={`modal-dialog${unitResults ? ' modal-dialog--wide' : ''}`} onClick={(e) => e.stopPropagation()}>
                <h3>Configure {editingUnit.type}: {editingUnit.varName}</h3>

                {unitResults && (
                  <div className="modal-nav">
                    <button type="button" className={editModalTab === 'settings' ? 'active' : ''} onClick={() => setEditModalTab('settings')}>Settings</button>
                    <button type="button" className={editModalTab === 'results' ? 'active' : ''} onClick={() => setEditModalTab('results')}>
                      <span className="modal-nav-dot modal-nav-dot--green" />Results
                    </button>
                  </div>
                )}

                {editModalTab === 'settings' && (<>
                <label>Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) {
                      setEditForm((f) => ({ ...f, name: v }));
                    }
                  }}
                  placeholder="e.g. inlet_stream"
                />
                {editForm.name !== '' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(editForm.name) && (
                  <span style={{ color: '#e74c3c', fontSize: 12 }}>Must be a valid Python identifier (letters, digits, underscores; cannot start with a digit)</span>
                )}

                <label>Flow Rate</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    value={editForm.flowRate}
                    onChange={(e) => setEditForm((f) => ({ ...f, flowRate: e.target.value }))}
                    placeholder="0.0"
                  />
                  <select value={editForm.flowRateUnit} onChange={(e) => setEditForm((f) => ({ ...f, flowRateUnit: e.target.value }))}>
                    <option value="kg/hr">kg/hr</option>
                    <option value="kg/min">kg/min</option>
                    <option value="m3/hr">m3/hr</option>
                    <option value="MSm3/day">MSm3/day</option>
                  </select>
                </div>

                <label>Pressure</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    value={editForm.pressure}
                    onChange={(e) => setEditForm((f) => ({ ...f, pressure: e.target.value }))}
                    placeholder="0.0"
                  />
                  <select value={editForm.pressureUnit} onChange={(e) => setEditForm((f) => ({ ...f, pressureUnit: e.target.value }))}>
                    <option value="bara">bara</option>
                    <option value="barg">barg</option>
                    <option value="psi">psi</option>
                    <option value="kPa">kPa</option>
                    <option value="MPa">MPa</option>
                  </select>
                </div>

                <label>Temperature</label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    value={editForm.temperature}
                    onChange={(e) => setEditForm((f) => ({ ...f, temperature: e.target.value }))}
                    placeholder="0.0"
                  />
                  <select value={editForm.temperatureUnit} onChange={(e) => setEditForm((f) => ({ ...f, temperatureUnit: e.target.value }))}>
                    <option value="C">°C</option>
                    <option value="K">K</option>
                    <option value="F">°F</option>
                  </select>
                </div>

                <label>Composition (mole fractions)</label>
                <div className="composition-grid">
                  {selectedCodes.map((code) => (
                    <div key={code} className="composition-row">
                      <span>{code}</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.0"
                        value={editForm.composition[code] ?? ''}
                        onChange={(e) => setEditForm((f) => ({
                          ...f,
                          composition: { ...f.composition, [code]: e.target.value }
                        }))}
                      />
                    </div>
                  ))}
                </div>
                {!isCompositionValid && (
                  <span style={{ color: '#e74c3c', fontSize: 12 }}>At least one component must have a composition greater than 0</span>
                )}

                <div className="footer-actions" style={{ marginTop: 18 }}>
                  <button className="secondary-action" type="button" onClick={() => setEditingUnit(null)}>Cancel</button>
                  <button className="primary-action" type="button" onClick={saveUnitConfig} disabled={!isNameValid || !isCompositionValid}>OK</button>
                </div>
                </>)}

                {editModalTab === 'results' && unitResults && (() => {
                  const sr = unitResults;
                  const pVal = resPressUnit === 'bara' ? sr.pressure_bar
                    : resPressUnit === 'kPa' ? sr.pressure_Pa / 1000
                    : resPressUnit === 'MPa' ? sr.pressure_Pa / 1e6
                    : sr.pressure_bar * 14.5038;
                  const tVal = resTempUnit === 'C' ? sr.temperature_C : sr.temperature_K;
                  const getFlow = (p: any) => resFlowUnit === 'mol/s' ? p.flowRate_mole_per_sec : resFlowUnit === 'kg/s' ? p.flowRate_kg_per_sec : p.flowRate_kg_per_hr;
                  const getVisc = (v: number | null) => v == null ? null : resViscUnit === 'cP' ? v * 1000 : v;
                  return (<>
                <div className="result-unit-bar">
                  <label>P: <select value={resPressUnit} onChange={(e) => setResPressUnit(e.target.value as any)}>
                    <option value="bara">bara</option><option value="kPa">kPa</option><option value="MPa">MPa</option><option value="psi">psi</option>
                  </select></label>
                  <label>T: <select value={resTempUnit} onChange={(e) => setResTempUnit(e.target.value as any)}>
                    <option value="C">°C</option><option value="K">K</option>
                  </select></label>
                  <label>Flow: <select value={resFlowUnit} onChange={(e) => setResFlowUnit(e.target.value as any)}>
                    <option value="mol/s">mol/s</option><option value="kg/s">kg/s</option><option value="kg/hr">kg/hr</option>
                  </select></label>
                  <label>Visc: <select value={resViscUnit} onChange={(e) => setResViscUnit(e.target.value as any)}>
                    <option value="Pa·s">Pa·s</option><option value="cP">cP</option>
                  </select></label>
                </div>
                <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: '0.85rem' }}>Phases: {sr.numberOfPhases} | P: {pVal?.toFixed(2) ?? '-'} {resPressUnit} | T: {tVal?.toFixed(2) ?? '-'} °{resTempUnit}</p>
                <div className="result-tabs">
                  <button type="button" className={resultTab === 'composition' ? 'active' : ''} onClick={() => setResultTab('composition')}>Composition</button>
                  <button type="button" className={resultTab === 'fractions' ? 'active' : ''} onClick={() => setResultTab('fractions')}>Phase Fractions</button>
                  <button type="button" className={resultTab === 'properties' ? 'active' : ''} onClick={() => setResultTab('properties')}>Properties</button>
                </div>
                {resultTab === 'composition' && (
                  <div className="result-table-wrap">
                    <table className="result-table">
                      <thead>
                        <tr>
                          <th>Component</th>
                          {sr.phases.map((p: any, i: number) => <th key={i}>{p.phaseName} x</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(sr.phases[0]?.components ?? {}).map((comp: string) => (
                          <tr key={comp}>
                            <td>{comp}</td>
                            {sr.phases.map((p: any, i: number) => <td key={i}>{p.components[comp]?.x?.toFixed(6) ?? '-'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {resultTab === 'fractions' && (
                  <div className="result-table-wrap">
                    <table className="result-table">
                      <thead><tr><th>Phase</th><th>Mole Fraction</th><th>Flow Rate ({resFlowUnit})</th></tr></thead>
                      <tbody>
                        {sr.phases.map((p: any, i: number) => (
                          <tr key={i}><td>{p.phaseName}</td><td>{p.phaseFraction?.toFixed(6) ?? '-'}</td><td>{getFlow(p)?.toFixed(6) ?? '-'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {resultTab === 'properties' && (
                  <div className="result-table-wrap">
                    <table className="result-table">
                      <thead><tr><th>Property</th>{sr.phases.map((p: any, i: number) => <th key={i}>{p.phaseName}</th>)}</tr></thead>
                      <tbody>
                        <tr><td>Density (kg/m³)</td>{sr.phases.map((p: any, i: number) => <td key={i}>{p.density_kg_m3 != null ? p.density_kg_m3.toFixed(4) : '-'}</td>)}</tr>
                        <tr><td>Molar Mass (g/mol)</td>{sr.phases.map((p: any, i: number) => <td key={i}>{p.molarMass_kg_mol != null ? (p.molarMass_kg_mol * 1000).toFixed(4) : '-'}</td>)}</tr>
                        <tr><td>Enthalpy (J/mol)</td>{sr.phases.map((p: any, i: number) => <td key={i}>{p.enthalpy_J_mol != null ? p.enthalpy_J_mol.toFixed(2) : '-'}</td>)}</tr>
                        <tr><td>Entropy (J/mol·K)</td>{sr.phases.map((p: any, i: number) => <td key={i}>{p.entropy_J_molK != null ? p.entropy_J_molK.toFixed(4) : '-'}</td>)}</tr>
                        <tr><td>Cp (J/mol·K)</td>{sr.phases.map((p: any, i: number) => <td key={i}>{p.Cp_J_molK != null ? p.Cp_J_molK.toFixed(4) : '-'}</td>)}</tr>
                        <tr><td>Viscosity ({resViscUnit})</td>{sr.phases.map((p: any, i: number) => <td key={i}>{getVisc(p.viscosity_Pa_s) != null ? (resViscUnit === 'cP' ? getVisc(p.viscosity_Pa_s)!.toFixed(4) : getVisc(p.viscosity_Pa_s)!.toExponential(4)) : '-'}</td>)}</tr>
                        <tr><td>Z (compressibility)</td>{sr.phases.map((p: any, i: number) => <td key={i}>{p.Z != null ? p.Z.toFixed(6) : '-'}</td>)}</tr>
                        <tr><td>Flow Rate ({resFlowUnit})</td>{sr.phases.map((p: any, i: number) => <td key={i}>{getFlow(p)?.toFixed(6) ?? '-'}</td>)}</tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="footer-actions" style={{ marginTop: 12 }}>
                  <button className="secondary-action" type="button" onClick={() => setEditingUnit(null)}>Close</button>
                </div>
                  </>);
                })()}
              </div>
            </div>
            );
          })()}
        </main>
      )}
    </div>
  );
}
