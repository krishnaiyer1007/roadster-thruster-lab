function build_roadster_models()
%BUILD_ROADSTER_MODELS  Programmatically build the three Simulink models.
%   models/RoadsterJump.slx    jump over five vehicles: Stateflow mission
%                              manager, attitude PD loop, landing burn, tank
%   models/RoadsterHover.slx   altitude hold on the lift thrusters
%   models/RoadsterLaunch.slx  0-60 mph with tyres, suction fans and rear thrusters
%
%   All three share the same cold-gas tank and nozzle block. Parameters come
%   from the base-workspace struct "rtl" (see rtl_params.m). Run run_all.m to
%   build, simulate and plot everything.

here = fileparts(mfilename('fullpath'));
addpath(here);
outDir = fullfile(here, 'models');
if ~exist(outDir, 'dir'), mkdir(outDir); end
build_jump(outDir);
build_hover(outDir);
build_launch(outDir);
fprintf('Built 3 models in %s\n', outDir);
end

% =====================================================================
function build_jump(outDir)
mdl = 'RoadsterJump';
sys = new_model(mdl, 8);

% --- sensing, mission manager, references
add_block('simulink/Sources/Clock', [sys '/Clock'], 'Position', [30 40 60 70]);
add_mlfcn(sys, 'Geometry & Sensing', code_geometry(), [700 380 860 500]);
build_mission_chart(sys, [160 30 330 150]);
add_mlfcn(sys, 'Reference Generator', code_refgen(), [400 30 560 110]);
add_mlfcn(sys, 'Lift Command', code_liftcmd(), [400 200 560 270]);

% --- attitude PD loop built from blocks so it reads as a control diagram
add_block('simulink/Math Operations/Sum', [sys '/e_theta'], 'Inputs', '+-', 'Position', [620 30 640 50]);
add_block('simulink/Math Operations/Sum', [sys '/e_omega'], 'Inputs', '+-', 'Position', [620 70 640 90]);
add_block('simulink/Math Operations/Gain', [sys '/Kp'], 'Gain', 'rtl.Kp', 'Position', [670 25 710 55]);
add_block('simulink/Math Operations/Gain', [sys '/Kd'], 'Gain', 'rtl.Kd', 'Position', [670 65 710 95]);
add_block('simulink/Math Operations/Sum', [sys '/Accel command'], 'Inputs', '+++', 'Position', [740 30 760 110]);
add_block('simulink/Math Operations/Gain', [sys '/Pitch inertia'], 'Gain', 'rtl.I', 'Position', [790 55 830 85]);
add_block('simulink/Discontinuities/Saturation', [sys '/Torque limit'], 'UpperLimit', 'rtl.Tmax', 'LowerLimit', '-rtl.Tmax', 'Position', [860 55 900 85]);
add_block('simulink/Math Operations/Product', [sys '/Airborne gate'], 'Position', [930 60 960 100]);
add_block('simulink/Math Operations/Abs', [sys '/|torque|'], 'Position', [990 120 1020 140]);
add_block('simulink/Math Operations/Gain', [sys '/per arm'], 'Gain', '1/rtl.arm', 'Position', [1040 115 1080 145]);

% --- plant: tank, nozzles, rigid body
add_mlfcn(sys, 'Tank & Thrusters', code_tank(), [1110 180 1270 300]);
add_mlfcn(sys, 'Rigid Body 2D', code_body(), [1320 180 1480 340]);
ints = {'vx','rtl.v0'; 'x','plan.xStart'; 'vy','0'; 'y','rtl.cg'; 'omega','0'; 'theta','0'; 'mAir','rtl.m0'};
for k = 1:size(ints,1)
    add_block('simulink/Continuous/Integrator', [sys '/' ints{k,1}], 'InitialCondition', ints{k,2}, ...
        'Position', [1530 + 70*mod(k-1,2), 160 + 50*k, 1560 + 70*mod(k-1,2), 190 + 50*k]);
end
set_param([sys '/mAir'], 'LimitOutput', 'on', 'LowerSaturationLimit', '0');
add_block('simulink/Math Operations/Gain', [sys '/air out'], 'Gain', '-1', 'Position', [1320 400 1350 420]);

% --- logging
add_block('simulink/Sinks/Scope', [sys '/Flight Scope'], 'NumInputPorts', '3', 'Position', [1750 520 1790 580]);

% --- wiring
L(sys, 'Clock/1', 'Mission Manager/1');   L(sys, 'x/1', 'Mission Manager/2');
L(sys, 'Geometry & Sensing/4', 'Mission Manager/3'); L(sys, 'Geometry & Sensing/3', 'Mission Manager/4');
L(sys, 'Clock/1', 'Reference Generator/1'); L(sys, 'Mission Manager/2', 'Reference Generator/2');
L(sys, 'Mission Manager/1', 'Reference Generator/3');
L(sys, 'Mission Manager/1', 'Lift Command/1'); L(sys, 'vy/1', 'Lift Command/2'); L(sys, 'mAir/1', 'Lift Command/3');
L(sys, 'Reference Generator/1', 'e_theta/1'); L(sys, 'theta/1', 'e_theta/2');
L(sys, 'Reference Generator/2', 'e_omega/1'); L(sys, 'omega/1', 'e_omega/2');
L(sys, 'e_theta/1', 'Kp/1'); L(sys, 'e_omega/1', 'Kd/1');
L(sys, 'Reference Generator/3', 'Accel command/1'); L(sys, 'Kp/1', 'Accel command/2'); L(sys, 'Kd/1', 'Accel command/3');
L(sys, 'Accel command/1', 'Pitch inertia/1'); L(sys, 'Pitch inertia/1', 'Torque limit/1');
L(sys, 'Torque limit/1', 'Airborne gate/1'); L(sys, 'Lift Command/2', 'Airborne gate/2');
L(sys, 'Airborne gate/1', '|torque|/1'); L(sys, '|torque|/1', 'per arm/1');
L(sys, 'mAir/1', 'Tank & Thrusters/1'); L(sys, 'Lift Command/1', 'Tank & Thrusters/2'); L(sys, 'per arm/1', 'Tank & Thrusters/3');
L(sys, 'Tank & Thrusters/1', 'Rigid Body 2D/1'); L(sys, 'Tank & Thrusters/2', 'Rigid Body 2D/2');
L(sys, 'Airborne gate/1', 'Rigid Body 2D/3'); L(sys, 'theta/1', 'Rigid Body 2D/4'); L(sys, 'omega/1', 'Rigid Body 2D/5');
L(sys, 'y/1', 'Rigid Body 2D/6'); L(sys, 'vy/1', 'Rigid Body 2D/7'); L(sys, 'Mission Manager/1', 'Rigid Body 2D/8');
L(sys, 'mAir/1', 'Rigid Body 2D/9');
L(sys, 'Rigid Body 2D/1', 'vx/1'); L(sys, 'vx/1', 'x/1');
L(sys, 'Rigid Body 2D/2', 'vy/1'); L(sys, 'vy/1', 'y/1');
L(sys, 'Rigid Body 2D/3', 'omega/1'); L(sys, 'omega/1', 'theta/1');
L(sys, 'Tank & Thrusters/3', 'air out/1'); L(sys, 'air out/1', 'mAir/1');
L(sys, 'x/1', 'Geometry & Sensing/1'); L(sys, 'y/1', 'Geometry & Sensing/2'); L(sys, 'theta/1', 'Geometry & Sensing/3');
L(sys, 'vy/1', 'Geometry & Sensing/4'); L(sys, 'mAir/1', 'Geometry & Sensing/5');
L(sys, 'Geometry & Sensing/1', 'Flight Scope/1'); L(sys, 'Tank & Thrusters/1', 'Flight Scope/2');
L(sys, 'Tank & Thrusters/4', 'Flight Scope/3');
% --- name the signals (these names become subsystem port names) and log the key ones
names = {'x/1','x',1; 'y/1','y',1; 'theta/1','theta',1; 'vy/1','vy',1; 'Mission Manager/1','mode',1;
         'Tank & Thrusters/1','F_lift',1; 'Tank & Thrusters/2','F_att',1; 'Tank & Thrusters/4','P_tank',1;
         'Tank & Thrusters/5','T_tank',1; 'mAir/1','m_air',1; 'Geometry & Sensing/1','low',1;
         'Geometry & Sensing/2','clearance',1; 'vx/1','vx',0; 'omega/1','omega',0; 'Mission Manager/2','tCoast',0;
         'Geometry & Sensing/3','touch',0; 'Geometry & Sensing/4','landNow',0; 'Lift Command/1','F_lift_demand',0;
         'Lift Command/2','airborne',0; 'Airborne gate/1','torque_cmd',0; 'per arm/1','F_att_demand',0;
         'Tank & Thrusters/3','mdot',0; 'Tank & Thrusters/6','Isp',0; 'Reference Generator/1','theta_ref',0;
         'Reference Generator/2','omega_ref',0; 'Reference Generator/3','alpha_ref',0; 'Rigid Body 2D/1','ax',0;
         'Rigid Body 2D/2','ay',0; 'Rigid Body 2D/3','alpha',0; 'Clock/1','t',0};
for k = 1:size(names,1), sig(sys, names{k,1}, names{k,2}, names{k,3}, 10); end
group(sys, 'Flight Controller', {'Reference Generator','e_theta','e_omega','Kp','Kd','Accel command', ...
    'Pitch inertia','Torque limit','Airborne gate','|torque|','per arm','Lift Command'});
group(sys, 'Vehicle Plant', {'Tank & Thrusters','Rigid Body 2D','vx','x','vy','y','omega','theta','mAir','air out'});
group(sys, 'Sensors', {'Geometry & Sensing'});
finish_model(mdl, outDir, ['Jump over five vehicles. Logged signals: x, y, theta, vy, mode, F_lift, F_att, ' ...
    'P_tank, T_tank, m_air, low, clearance. Modes: 0 roll, 1 boost, 2 coast, 3 landing burn, 4 landed.']);
end

% =====================================================================
function build_hover(outDir)
mdl = 'RoadsterHover';
sys = new_model(mdl, 8);
add_block('simulink/Sources/Clock', [sys '/Clock'], 'Position', [30 40 60 70]);
add_mlfcn(sys, 'Hover Manager', code_hover_mgr(), [120 30 290 150]);
hm = sfroot().find('-isa', 'Stateflow.EMChart', 'Path', [sys '/Hover Manager']);
hm.ChartUpdate = 'DISCRETE'; hm.SampleTime = '1e-3';   % keeps its phase memory, so it runs at a fixed 1 ms rate
add_block('simulink/Sources/Constant', [sys '/No attitude'], 'Value', '0', 'Position', [330 170 360 190]);
add_mlfcn(sys, 'Tank & Thrusters', code_tank(), [400 40 560 160]);
add_mlfcn(sys, 'Vertical Dynamics', code_vdyn(), [620 40 780 140]);
add_block('simulink/Continuous/Integrator', [sys '/vy'], 'InitialCondition', '0', 'Position', [830 50 860 80]);
add_block('simulink/Continuous/Integrator', [sys '/y'], 'InitialCondition', '0', 'LimitOutput', 'on', ...
    'LowerSaturationLimit', '0', 'Position', [900 50 930 80]);
add_block('simulink/Continuous/Integrator', [sys '/mAir'], 'InitialCondition', 'rtl.m0', 'LimitOutput', 'on', ...
    'LowerSaturationLimit', '0', 'Position', [830 160 860 190]);
add_block('simulink/Math Operations/Gain', [sys '/air out'], 'Gain', '-1', 'Position', [620 170 650 190]);
add_block('simulink/Sinks/Scope', [sys '/Hover Scope'], 'NumInputPorts', '3', 'Position', [1050 200 1090 260]);

L(sys, 'Clock/1', 'Hover Manager/1'); L(sys, 'y/1', 'Hover Manager/2'); L(sys, 'vy/1', 'Hover Manager/3'); L(sys, 'mAir/1', 'Hover Manager/4');
L(sys, 'mAir/1', 'Tank & Thrusters/1'); L(sys, 'Hover Manager/1', 'Tank & Thrusters/2'); L(sys, 'No attitude/1', 'Tank & Thrusters/3');
L(sys, 'Tank & Thrusters/1', 'Vertical Dynamics/1'); L(sys, 'y/1', 'Vertical Dynamics/2'); L(sys, 'vy/1', 'Vertical Dynamics/3');
L(sys, 'mAir/1', 'Vertical Dynamics/4');
L(sys, 'Vertical Dynamics/1', 'vy/1'); L(sys, 'vy/1', 'y/1');
L(sys, 'Tank & Thrusters/3', 'air out/1'); L(sys, 'air out/1', 'mAir/1');
L(sys, 'y/1', 'Hover Scope/1'); L(sys, 'Tank & Thrusters/1', 'Hover Scope/2'); L(sys, 'Tank & Thrusters/4', 'Hover Scope/3');
names = {'y/1','y',1; 'vy/1','vy',1; 'Tank & Thrusters/1','F_lift',1; 'Tank & Thrusters/4','P_tank',1;
         'Tank & Thrusters/5','T_tank',1; 'mAir/1','m_air',1; 'Hover Manager/2','phase',1; 'Tank & Thrusters/6','Isp',1;
         'Hover Manager/1','F_demand',0; 'Tank & Thrusters/3','mdot',0; 'Vertical Dynamics/1','ay',0; 'Clock/1','t',0};
for k = 1:size(names,1), sig(sys, names{k,1}, names{k,2}, names{k,3}, 10); end
group(sys, 'Vehicle Plant', {'No attitude','Tank & Thrusters','Vertical Dynamics','vy','y','mAir','air out'});
finish_model(mdl, outDir, ['Hover on the 4 lift thrusters. Logged: y, vy, F_lift, P_tank, T_tank, m_air, phase, Isp. ' ...
    'Phases: 0 climb, 1 hold, 2 descend, 3 landed.']);
end

% =====================================================================
function build_launch(outDir)
mdl = 'RoadsterLaunch';
sys = new_model(mdl, 8);
add_block('simulink/Sources/Constant', [sys '/launchMode'], 'Value', 'launchMode', 'Position', [30 40 80 70]);
add_mlfcn(sys, 'Rear Command', code_rearcmd(), [120 30 260 80]);
add_block('simulink/Sources/Constant', [sys '/No second group'], 'Value', '0', 'Position', [150 130 180 150]);
add_mlfcn(sys, 'Tank & Thrusters', code_tank(), [300 30 460 150]);
add_mlfcn(sys, 'Longitudinal Dynamics', code_lon(), [520 30 680 130]);
add_block('simulink/Continuous/Integrator', [sys '/v'], 'InitialCondition', '0', 'Position', [730 40 760 70]);
add_block('simulink/Continuous/Integrator', [sys '/x'], 'InitialCondition', '0', 'Position', [800 40 830 70]);
add_block('simulink/Continuous/Integrator', [sys '/mAir'], 'InitialCondition', 'rtl.m0', 'LimitOutput', 'on', ...
    'LowerSaturationLimit', '0', 'Position', [730 160 760 190]);
add_block('simulink/Math Operations/Gain', [sys '/air out'], 'Gain', '-1', 'Position', [520 170 550 190]);
add_block('simulink/Logic and Bit Operations/Compare To Constant', [sys '/Reached 60 mph'], ...
    'relop', '>=', 'const', '26.8224', 'Position', [880 100 940 130]);
add_block('simulink/Sinks/Stop Simulation', [sys '/Stop'], 'Position', [980 100 1010 130]);

L(sys, 'launchMode/1', 'Rear Command/1');
L(sys, 'mAir/1', 'Tank & Thrusters/1'); L(sys, 'Rear Command/1', 'Tank & Thrusters/2'); L(sys, 'No second group/1', 'Tank & Thrusters/3');
L(sys, 'v/1', 'Longitudinal Dynamics/1'); L(sys, 'mAir/1', 'Longitudinal Dynamics/2');
L(sys, 'Tank & Thrusters/1', 'Longitudinal Dynamics/3'); L(sys, 'launchMode/1', 'Longitudinal Dynamics/4');
L(sys, 'Longitudinal Dynamics/1', 'v/1'); L(sys, 'v/1', 'x/1');
L(sys, 'Tank & Thrusters/3', 'air out/1'); L(sys, 'air out/1', 'mAir/1');
L(sys, 'v/1', 'Reached 60 mph/1'); L(sys, 'Reached 60 mph/1', 'Stop/1');
names = {'v/1','v',1; 'x/1','x',1; 'Tank & Thrusters/1','F_rear',1; 'mAir/1','m_air',1;
         'Rear Command/1','F_rear_demand',0; 'Longitudinal Dynamics/1','a',0; 'launchMode/1','mode',0};
for k = 1:size(names,1), sig(sys, names{k,1}, names{k,2}, names{k,3}, 4); end
group(sys, 'Vehicle Plant', {'Rear Command','No second group','Tank & Thrusters','Longitudinal Dynamics','v','x','mAir','air out'});
finish_model(mdl, outDir, ['0-60 mph. launchMode 0 tyres only, 1 + suction fans, 2 + fans + 2 rear thrusters. ' ...
    'Logged: v, x, F_rear, m_air.']);
end

% =====================================================================
%  Helpers
% =====================================================================
function sys = new_model(mdl, stopTime)
if bdIsLoaded(mdl), close_system(mdl, 0); end
new_system(mdl); sys = mdl;
% Fixed-step Euler at 1 ms matches the integrator in web/physics.js
set_param(mdl, 'Solver', 'ode1', 'FixedStep', '1e-3', 'StopTime', num2str(stopTime), ...
    'SaveTime', 'on', 'ReturnWorkspaceOutputs', 'on', 'SaveOutput', 'off', ...
    'SignalLogging', 'on', 'SignalLoggingName', 'logsout');
end

function sig(sys, src, name, logIt, decim)
% Name the line leaving src ('Block/port'); optionally log it to logsout.
parts = regexp(src, '^(.*)/(\d+)$', 'tokens', 'once');
ph = get_param([sys '/' parts{1}], 'PortHandles');
op = ph.Outport(str2double(parts{2}));
ln = get_param(op, 'Line');
if ln == -1                       % unconnected output
    if ~logIt, return; end
    term = [sys '/' name ' (log)'];
    add_block('simulink/Sinks/Terminator', term);
    L(sys, src, [name ' (log)/1']);
    ln = get_param(op, 'Line');
end
set_param(ln, 'Name', name);
if logIt
    set_param(op, 'DataLogging', 'on', 'DataLoggingNameMode', 'Custom', 'DataLoggingName', name, ...
        'DataLoggingDecimateData', 'on', 'DataLoggingDecimation', num2str(decim));
end
end

function group(sys, name, blocks)
% Collapse a set of blocks into a named subsystem so the top level reads cleanly.
h = zeros(1, numel(blocks));
for k = 1:numel(blocks), h(k) = get_param([sys '/' blocks{k}], 'Handle'); end
Simulink.BlockDiagram.createSubsystem(h);
sub = find_system(sys, 'SearchDepth', 1, 'BlockType', 'SubSystem', 'Name', 'Subsystem');
set_param(sub{1}, 'Name', name);
try, Simulink.BlockDiagram.arrangeSystem([sys '/' name]); catch, end
end

function finish_model(mdl, outDir, desc)
w = warning('off', 'all');
try
    Simulink.BlockDiagram.arrangeSystem(mdl);
catch
end
warning(w);
set_param(mdl, 'Description', desc);
try
    note = Simulink.Annotation(mdl, ['Roadster Thruster Lab: ' desc]);
    note.Position = [20 -90 900 -40];
catch
end
save_system(mdl, fullfile(outDir, [mdl '.slx']));
close_system(mdl, 0);
end

function L(sys, src, dst)
add_line(sys, src, dst, 'autorouting', 'smart');
end

function blk = add_mlfcn(sys, name, code, pos)
blk = [sys '/' name];
add_block('simulink/User-Defined Functions/MATLAB Function', blk, 'Position', pos);
rt = sfroot;
ch = rt.find('-isa', 'Stateflow.EMChart', 'Path', blk);
ch.Script = code;
d = ch.find('-isa', 'Stateflow.Data', 'Name', 'rtl');
if ~isempty(d), d.Scope = 'Parameter'; end
end

function build_mission_chart(sys, pos)
blk = [sys '/Mission Manager'];
add_block('sflib/Chart', blk, 'Position', pos);
rt = sfroot;
ch = rt.find('-isa', 'Stateflow.Chart', 'Path', blk);
ch.ActionLanguage = 'MATLAB';
ch.ChartUpdate = 'DISCRETE';
ch.SampleTime = '1e-3';
mk = @(n, scope, port) mkdata(ch, n, scope, port);
mk('t', 'Input', 1); mk('x', 'Input', 2); mk('landNow', 'Input', 3); mk('touch', 'Input', 4);
mk('mode', 'Output', 1); mk('tCoast', 'Output', 2);
mk('tb', 'Local', 0);
mk('xBurn', 'Parameter', 0); mk('tBurn', 'Parameter', 0);

W = 170; H = 70;
sRoll  = mkstate(ch, sprintf('ROLL\nentry: mode = 0;'),                      [40 60 W H]);
sBoost = mkstate(ch, sprintf('BOOST\nentry: mode = 1; tb = t;'),             [330 60 W H]);
sCoast = mkstate(ch, sprintf('COAST\nentry: mode = 2; tCoast = t;'),         [620 60 W H]);
sLand  = mkstate(ch, sprintf('LANDING_BURN\nentry: mode = 3;'),              [620 260 W H]);
sDone  = mkstate(ch, sprintf('LANDED\nentry: mode = 4;'),                    [330 260 W H]);

td = Stateflow.Transition(ch); td.Destination = sRoll; td.DestinationOClock = 0;
td.SourceEndpoint = td.DestinationEndpoint - [0 30]; td.MidPoint = td.DestinationEndpoint - [0 15];
mktrans(ch, sRoll,  sBoost, '[x >= xBurn]',                     3, 9);
mktrans(ch, sBoost, sCoast, '[t >= tb + tBurn]',                3, 9);
mktrans(ch, sBoost, sDone,  '[touch > 0.5 && t > tb + 0.05]',   6, 0);
mktrans(ch, sCoast, sLand,  '[landNow > 0.5]',                  6, 0);
mktrans(ch, sCoast, sDone,  '[touch > 0.5]',                    7.5, 1.5);
mktrans(ch, sLand,  sDone,  '[touch > 0.5]',                    9, 3);
end

function d = mkdata(ch, name, scope, port)
d = Stateflow.Data(ch); d.Name = name; d.Scope = scope;
if any(strcmp(scope, {'Output','Local'})), d.DataType = 'double'; end
if port > 0, d.Port = port; end
end

function s = mkstate(ch, label, pos)
s = Stateflow.State(ch); s.LabelString = label; s.Position = pos;
end

function t = mktrans(ch, a, b, label, so, do)
t = Stateflow.Transition(ch); t.Source = a; t.Destination = b; t.LabelString = label;
t.SourceOClock = so; t.DestinationOClock = do;
end

% =====================================================================
%  MATLAB Function block code (shared physics, mirrors web/physics.js)
% =====================================================================
function c = code_tank()
c = strjoin({
'function [F1, F2, mdot, P, T, Isp] = tank_thrusters(mAir, F1d, F2d, rtl)'
'%#codegen'
'% Cold-gas tank with adiabatic blowdown feeding regulated, choked nozzles.'
'r   = max(mAir, 1e-6) / rtl.m0;'
'P   = rtl.P0 * r^rtl.gam;              % isentropic: gas left behind expands'
'T   = rtl.T0 * r^(rtl.gam - 1);        % ...and cools'
'pc  = min(rtl.Preg, P);                % regulator caps the nozzle feed'
'Cf  = rtl.CFm + (pc*rtl.PR - rtl.Pa)/pc*rtl.eps;'
'Isp = Cf * sqrt(rtl.R*T/rtl.gam) / rtl.CK / rtl.g0;'
'k   = pc / rtl.Preg;'
'if pc < 15e5, k = 0; end               % too little pressure to run'
'F1  = max(F1d, 0) * k;'
'F2  = max(F2d, 0) * k;'
'mdot = (F1 + F2) / (Isp * rtl.g0);     % rocket equation: mdot = F/(Isp g0)'
}, newline);
end

function c = code_geometry()
c = strjoin({
'function [low, clr, touch, landNow] = geometry(x, y, th, vy, mAir, rtl)'
'%#codegen'
'% Lowest point of the car body, clearance over the vehicle row, and the'
'% landing-burn trigger (stopping distance at the available deceleration).'
'px = [linspace(-2.2, 2.2, 9), linspace(-2.2, 2.2, 9), -2.2, 2.2, -1.35, 1.35];'
'py = [-0.42*ones(1,9), 0.58*ones(1,9), 0.08, -0.15, -0.55, -0.55];'
'c = cos(th); s = sin(th);'
'low = 1e9; clr = 99;'
'for i = 1:numel(px)'
'    wx = x + px(i)*c - py(i)*s;'
'    wy = y + px(i)*s + py(i)*c;'
'    low = min(low, wy);'
'    for k = 1:size(rtl.obs, 1)'
'        if wx >= rtl.obs(k,1) && wx <= rtl.obs(k,2)'
'            clr = min(clr, wy - rtl.obs(k,3));'
'        end'
'    end'
'end'
'touch = double(low <= 0 && vy < 0);'
'r  = max(mAir, 1e-6)/rtl.m0;'
'pc = min(rtl.Preg, rtl.P0*r^rtl.gam);'
'an = rtl.FliftMax*(pc/rtl.Preg)/(rtl.dry + mAir) - rtl.g0;'
'e  = th - 2*pi*round(th/(2*pi));'
'landNow = 0;'
'if vy < 0 && an > 0 && abs(e) < 0.25 && low <= vy^2/(2*an) + 0.3'
'    landNow = 1;'
'end'
}, newline);
end

function c = code_refgen()
c = strjoin({
'function [thRef, omRef, alRef] = reference(t, tCoast, mode, rtl)'
'%#codegen'
'% Pitch reference: hold level, or a minimum-jerk 360 degree flip after the burn.'
'thRef = 0; omRef = 0; alRef = 0;'
'if rtl.spin > 0 && mode >= 2 && tCoast > 0'
'    D = rtl.Dspin;'
'    u = min(1, max(0, (t - tCoast)/D));'
'    thRef = 2*pi*(10*u^3 - 15*u^4 + 6*u^5);'
'    if u < 1'
'        omRef = 2*pi*(30*u^2 - 60*u^3 + 30*u^4)/D;'
'        alRef = 2*pi*(60*u - 180*u^2 + 120*u^3)/D^2;'
'    end'
'end'
}, newline);
end

function c = code_liftcmd()
c = strjoin({
'function [FlDem, air] = lift_command(mode, vy, mAir, rtl)'
'%#codegen'
'% Boost: full lift. Landing burn: track a 1 m/s descent. Otherwise off.'
'm = rtl.dry + mAir;'
'FlDem = 0;'
'if mode == 1'
'    FlDem = rtl.FliftMax;'
'elseif mode == 3'
'    FlDem = min(rtl.FliftMax, max(0, m*(rtl.g0 + 8*(-1.0 - vy))));'
'end'
'air = double(mode >= 1 && mode <= 3);'
}, newline);
end

function c = code_body()
c = strjoin({
'function [ax, ay, alpha] = rigid_body(Fl, Fa, tq, th, om, y, vy, mode, mAir, rtl)'
'%#codegen'
'% Planar rigid body. Lift acts along the body normal; attitude jets give torque.'
'% After landing, a stiff spring-damper stands in for tyres and suspension.'
'm = rtl.dry + mAir;'
'ax = 0; ay = 0; alpha = 0;'
'if mode >= 1 && mode <= 3'
'    ax = -sin(th)*Fl/m;'
'    ay =  cos(th)*Fl/m - rtl.g0;'
'    alpha = sign(tq)*Fa*rtl.arm/rtl.I;'
'elseif mode == 4'
'    thR = 2*pi*round(th/(2*pi));'
'    ay = 900*(rtl.cg - y) - 60*vy;'
'    alpha = 900*(thR - th) - 60*om;'
'end'
}, newline);
end

function c = code_hover_mgr()
c = strjoin({
'function [Fd, phase] = hover_manager(t, y, vy, mAir, rtl)'
'%#codegen'
'% Climb to the target height, hold, then descend under control once the tank'
'% nears the regulator pressure so there is still air left to land.'
'persistent ph tgt'
'if isempty(ph), ph = 0; tgt = rtl.hoverAlt; end   % 0 climb, 1 hold, 2 descend, 3 landed'
'P = rtl.P0*(max(mAir, 1e-6)/rtl.m0)^rtl.gam;'
'if (ph == 0 || ph == 1) && P < 1.08*rtl.Preg, ph = 2; end'
'if ph == 0 && y >= 0.95*rtl.hoverAlt, ph = 1; end'
'vref = 0;'
'if ph == 2'
'    tgt = max(0, tgt - 0.9*1e-3);'
'    if tgt > 0, vref = -0.9; end'
'    if y <= 0 && t > 0.5, ph = 3; end'
'end'
'Fd = 0;'
'if ph < 3'
'    m = rtl.dry + mAir;'
'    Fd = min(rtl.FliftMax, max(0, m*(rtl.g0 + 4*(tgt - y) + 4.5*(vref - vy))));'
'end'
'phase = ph;'
}, newline);
end

function c = code_vdyn()
c = strjoin({
'function ay = vertical_dynamics(F, y, vy, mAir, rtl)'
'%#codegen'
'ay = F/(rtl.dry + mAir) - rtl.g0;'
'if y <= 1e-9 && ay < 0'
'    ay = 0;'
'    if vy < 0, ay = -vy/1e-3; end   % ground stops the car'
'end'
}, newline);
end

function c = code_rearcmd()
c = strjoin({
'function FrDem = rear_command(mode, rtl)'
'%#codegen'
'FrDem = 0;'
'if mode == 2, FrDem = rtl.FrearMax; end'
}, newline);
end

function c = code_lon()
c = strjoin({
'function a = longitudinal(v, mAir, Fr, mode, rtl)'
'%#codegen'
'% Tyre force is capped by grip (weight plus fan suction) and by motor power.'
'm  = rtl.dry + mAir;'
'dp = 0;'
'if mode >= 1, dp = rtl.fanKPa*1e3; end'
'N  = m*rtl.g0 + dp*rtl.fanA;'
'Ft = min(rtl.mu*N, rtl.motorKW*1e3/max(v, 0.3));'
'a  = (Ft + Fr - 0.5*1.2*rtl.CdA*v^2 - rtl.crr*N)/m;'
}, newline);
end
