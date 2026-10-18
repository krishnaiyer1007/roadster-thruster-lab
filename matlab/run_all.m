function results = run_all(varargin)
%RUN_ALL  Build, simulate, validate and plot the Roadster Thruster Lab models.
%   run_all            builds the models if missing, runs every scenario,
%                      saves figures to docs/figures and docs/validation.md
%   run_all('rebuild') forces the Simulink models to be rebuilt first
%
%   The Simulink results are cross-checked against the web model
%   (web/physics.js) by calling Node.js, so both versions stay in step.

here   = fileparts(mfilename('fullpath'));
root   = fileparts(here);
figDir = fullfile(root, 'docs', 'figures');
if ~exist(figDir, 'dir'), mkdir(figDir); end
addpath(here);
if any(strcmp(varargin, 'rebuild')) || ~exist(fullfile(here, 'models', 'RoadsterJump.slx'), 'file')
    build_roadster_models();
end
addpath(fullfile(here, 'models'));

C = rtl_colours();
rtl  = rtl_params();
plan = rtl_plan_jump(rtl);
push(rtl, plan);

%% ---------------------------------------------------------------- Jump
so = sim('RoadsterJump');
[J, tJ] = logmat(so, {'x','y','theta','vy','mode','F_lift','F_att','P_tank','T_tank','m_air','low','clearance'});
mode = J(:,5); air = mode >= 1 & mode <= 3;
iTake = find(mode >= 1, 1); iLand = find(mode == 4, 1);
jump.apex     = max(J(air, 11));
jump.minClear = min(J(air & J(:,12) < 90, 12));
jump.clipped  = any(J(:,12) < 0);
jump.airtime  = tJ(iLand) - tJ(iTake);
jump.vLand    = abs(J(iLand-1, 4));
jump.air      = rtl.m0 - J(end, 10);
jump.log = J; jump.t = tJ;
fprintf('Jump   : apex %.2f m, min clearance %.2f m, airtime %.2f s, touchdown %.2f m/s, air %.0f kg\n', ...
    jump.apex, jump.minClear, jump.airtime, jump.vLand, jump.air);

%% ---------------------------------------------------------------- Launch
launch = struct('t060', zeros(1,3), 'v', {cell(1,3)}, 't', {cell(1,3)}, 'air', 0);
for k = 0:2
    assignin('base', 'launchMode', k);
    so = sim('RoadsterLaunch');
    [Lg, tL] = logmat(so, {'v','x','F_rear','m_air'});
    launch.t060(k+1) = so.tout(end);
    launch.t{k+1} = tL;
    launch.v{k+1} = Lg(:,1);
    if k == 2, launch.air = rtl.m0 - Lg(end,4); end
end
fprintf('Launch : 0-60 mph %.2f s tyres, %.2f s + fans, %.2f s + thrusters (%.1f kg air)\n', launch.t060, launch.air);

%% ---------------------------------------------------------------- Hover
so = sim('RoadsterHover');
[Hl, tH] = logmat(so, {'y','vy','F_lift','P_tank','T_tank','m_air','phase','Isp'});
ph = Hl(:,7);
iHold = find(ph == 1, 1); iDesc = find(ph == 2, 1); iDone = find(ph == 3, 1);
iTouch = find(ph >= 2 & Hl(:,1) <= 1e-6, 1);
hover.flight = tH(iDone);
hover.hold   = tH(iDesc) - tH(iHold);
hover.vTouch = abs(Hl(max(iTouch-1,1), 2));
hover.air    = rtl.m0 - Hl(end, 6);
hover.Tend   = Hl(iDone, 5) - 273.15;
hover.log = Hl; hover.t = tH;
fprintf('Hover  : airborne %.2f s, holding %.2f s, touchdown %.2f m/s, tank %.0f C at the end\n', ...
    hover.flight, hover.hold, hover.vTouch, hover.Tend);

%% ---------------------------------------------------------------- Pressure sweep (hover)
pSweep = 200:50:700; tSweep = zeros(size(pSweep)); mSweep = zeros(size(pSweep));
for k = 1:numel(pSweep)
    r2 = rtl_params(struct('P0bar', pSweep(k))); push(r2, rtl_plan_jump(r2));
    so = sim('RoadsterHover', 'StopTime', '40'); Hs = logmat(so, {'y','vy','F_lift','P_tank','T_tank','m_air','phase','Isp'});
    tS = so.logsout.get('phase').Values.Time;
    iL = find(Hs(:,7) == 3, 1); if isempty(iL), tSweep(k) = NaN; else, tSweep(k) = tS(iL); end
    mSweep(k) = r2.m0;
end
push(rtl, plan);

%% ---------------------------------------------------------------- Cross-check with the web model
web = web_reference(root);
results = struct('jump', jump, 'launch', launch, 'hover', hover, 'web', web, 'rtl', rtl);
write_validation(root, rtl, jump, launch, hover, web);

%% ---------------------------------------------------------------- Figures
fig_jump(figDir, rtl, plan, jump, C);
fig_telemetry(figDir, rtl, jump, C);
fig_launch(figDir, launch, C);
fig_hover(figDir, rtl, hover, C);
fig_sweep(figDir, pSweep, tSweep, mSweep, C);
fig_upside(figDir, rtl, C);
fig_recharge(figDir, rtl, jump, hover, launch, C);
save_diagrams(figDir);
fprintf('Figures saved to %s\n', figDir);
end

% =====================================================================
function [M, t] = logmat(so, names)
% Pull logged signals out of logsout into one matrix, columns in the order given.
ds = so.logsout;
v = ds.get(names{1}).Values; t = v.Time; M = zeros(numel(t), numel(names));
for k = 1:numel(names)
    v = ds.get(names{k}).Values;
    M(:,k) = interp1(v.Time, squeeze(v.Data), t, 'previous', 'extrap');
end
end

function push(rtl, plan)
assignin('base', 'rtl', rtl);   assignin('base', 'plan', plan);
assignin('base', 'xBurn', plan.xBurn); assignin('base', 'tBurn', rtl.burn);
assignin('base', 'launchMode', 2);
end

function C = rtl_colours()
C.frost = [26 111 173]/255; C.amber = [185 98 15]/255; C.muted = [83 100 111]/255;
C.good = [31 122 74]/255; C.bad = [179 50 42]/255; C.ink = [18 32 41]/255;
C.obs = [181 193 201]/255; C.ground = [142 156 166]/255;
end

function f = newfig(w, h)
f = figure('Visible', 'off', 'Color', 'w', 'Units', 'pixels', 'Position', [100 100 w h]);
try, theme(f, 'light'); catch, end
set(f, 'DefaultAxesFontName', 'Helvetica', 'DefaultAxesFontSize', 11, 'DefaultAxesBox', 'off', ...
    'DefaultAxesTickDir', 'out', 'DefaultLineLineWidth', 2);
end

function savefig_(f, figDir, name)
exportgraphics(f, fullfile(figDir, [name '.png']), 'Resolution', 200, 'BackgroundColor', 'white');
close(f);
end

% ---------------------------------------------------------------------
function fig_jump(figDir, rtl, plan, jump, C)
f = newfig(1400, 520); ax = axes(f); hold(ax, 'on');
names = {'Robotaxi','Pickup','Semi tractor','SUV','Saloon'};
for k = 1:5
    o = rtl.obs(k,:);
    rectangle(ax, 'Position', [o(1) 0 o(2)-o(1) o(3)], 'Curvature', [0.06 0.12], 'FaceColor', C.obs, 'EdgeColor', C.muted);
    text(ax, (o(1)+o(2))/2, o(3)+0.25, names{k}, 'HorizontalAlignment', 'center', 'FontSize', 10, 'Color', C.muted);
end
J = jump.log; mode = J(:,5);
cols = {C.muted, C.amber, C.frost, C.good, C.muted}; labels = {'roll','lift burn','coast','landing burn','landed'};
hl = gobjects(0); ll = {};
for m = 0:4
    idx = find(mode == m);
    if isempty(idx), continue; end
    idx = [max(idx(1)-1,1); idx];
    hl(end+1) = plot(ax, J(idx,1), J(idx,11), '-', 'Color', cols{m+1}, 'LineWidth', 3); %#ok<AGROW>
    ll{end+1} = labels{m+1}; %#ok<AGROW>
end
yline(ax, 0, 'Color', C.ground, 'LineWidth', 2);
xline(ax, plan.xBurn, ':', 'burn starts', 'Color', C.amber, 'LabelVerticalAlignment', 'middle');
[~, iA] = max(J(:,11).*(mode>=1 & mode<=3));
plot(ax, J(iA,1), J(iA,11), 'o', 'MarkerFaceColor', C.frost, 'MarkerEdgeColor', 'w', 'MarkerSize', 8);
text(ax, J(iA,1)+1, J(iA,11)+0.35, sprintf('apex %.1f m', J(iA,11)), 'Color', C.ink);
xlabel(ax, 'distance along the road (m)'); ylabel(ax, 'lowest point of the car (m)');
title(ax, sprintf('Jump over five vehicles: closest gap %.2f m, %.2f s in the air, lands at %.1f m/s', ...
    jump.minClear, jump.airtime, jump.vLand), 'FontWeight', 'normal');
legend(ax, hl, ll, 'Location', 'northeast', 'Box', 'off');
xlim(ax, [plan.xBurn-8, max(J(find(mode == 4, 1) + 30, 1), rtl.obs(end,2)+16)]); ylim(ax, [0 max(8, jump.apex+2)]); grid(ax, 'on'); ax.GridAlpha = 0.12;
savefig_(f, figDir, 'jump_trajectory');
end

function fig_telemetry(figDir, rtl, jump, C)
J = jump.log; t = jump.t; i0 = find(J(:,5) >= 1, 1); t = t - t(i0);
iEnd = min(size(J,1), find(J(:,5) == 4, 1) + 40); r = max(1,i0-20):iEnd;
f = newfig(1100, 820); tl = tiledlayout(f, 3, 1, 'TileSpacing', 'compact');
ax = nexttile(tl); hold(ax, 'on');
plot(ax, t(r), J(r,6)/1e3, 'Color', C.frost); plot(ax, t(r), J(r,7)/1e3, 'Color', C.amber);
yline(ax, (rtl.dry+rtl.m0)*rtl.g0/1e3, '--', 'car weight', 'Color', C.muted);
ylabel(ax, 'thrust (kN)'); legend(ax, {'lift, 4 nozzles', 'attitude'}, 'Box', 'off'); grid(ax, 'on'); ax.GridAlpha = 0.12;
title(ax, 'Jump telemetry from the Simulink model', 'FontWeight', 'normal');
ax = nexttile(tl); hold(ax, 'on');
plot(ax, t(r), J(r,8)/1e5, 'Color', C.frost); yline(ax, rtl.Pregbar, '--', 'regulator', 'Color', C.amber);
ylabel(ax, 'tank pressure (bar)'); grid(ax, 'on'); ax.GridAlpha = 0.12;
ax = nexttile(tl); hold(ax, 'on');
plot(ax, t(r), rad2deg(J(r,3)), 'Color', C.ink); ylabel(ax, 'pitch (deg)'); xlabel(ax, 'time from lift-off (s)');
grid(ax, 'on'); ax.GridAlpha = 0.12;
savefig_(f, figDir, 'jump_telemetry');
end

function fig_launch(figDir, launch, C)
f = newfig(1000, 560); ax = axes(f); hold(ax, 'on');
cols = {C.muted, C.amber, C.frost}; names = {'tyres only', '+ suction fans', '+ fans + 2 rear thrusters'};
for k = 1:3
    plot(ax, launch.t{k}, launch.v{k}*2.23694, 'Color', cols{k});
    text(ax, launch.t060(k)+0.03, 61.5, sprintf('%.2f s', launch.t060(k)), 'Color', cols{k}, 'FontWeight', 'bold');
end
yline(ax, 60, '--', 'Color', C.muted);
xlabel(ax, 'time (s)'); ylabel(ax, 'speed (mph)'); ylim(ax, [0 68]); grid(ax, 'on'); ax.GridAlpha = 0.12;
legend(ax, names, 'Location', 'southeast', 'Box', 'off');
title(ax, '0 to 60 mph: tyres hit a grip wall, thrusters go round it', 'FontWeight', 'normal');
savefig_(f, figDir, 'launch_0_60');
end

function fig_hover(figDir, rtl, hover, C)
H = hover.log; t = hover.t; iEnd = find(H(:,7) == 3, 1) + 30; r = 1:min(iEnd, size(H,1));
f = newfig(1100, 760); tl = tiledlayout(f, 2, 2, 'TileSpacing', 'compact');
ax = nexttile(tl); plot(ax, t(r), H(r,1), 'Color', C.frost); yline(ax, rtl.hoverAlt, '--', 'target', 'Color', C.amber);
ylabel(ax, 'height (m)'); ylim(ax, [0 rtl.hoverAlt*1.25]); grid(ax, 'on'); ax.GridAlpha = 0.12; title(ax, 'Height', 'FontWeight', 'normal');
ax = nexttile(tl); plot(ax, t(r), H(r,4)/1e5, 'Color', C.frost); yline(ax, rtl.Pregbar, '--', 'regulator', 'Color', C.amber);
ylabel(ax, 'bar'); grid(ax, 'on'); ax.GridAlpha = 0.12; title(ax, 'Tank pressure', 'FontWeight', 'normal');
ax = nexttile(tl); hold(ax, 'on'); plot(ax, t(r), H(r,3)/1e3, 'Color', C.frost);
plot(ax, t(r), (rtl.dry + H(r,6))*rtl.g0/1e3, '--', 'Color', C.muted, 'LineWidth', 1.5);
ylabel(ax, 'kN'); xlabel(ax, 'time (s)'); legend(ax, {'lift thrust', 'weight'}, 'Box', 'off'); grid(ax, 'on'); ax.GridAlpha = 0.12;
title(ax, 'Thrust against weight', 'FontWeight', 'normal');
ax = nexttile(tl); yyaxis(ax, 'left'); plot(ax, t(r), H(r,5)-273.15, 'Color', C.frost); ylabel(ax, 'tank gas (°C)');
yyaxis(ax, 'right'); plot(ax, t(r), H(r,8), 'Color', C.amber); ylabel(ax, 'specific impulse (s)');
xlabel(ax, 'time (s)'); grid(ax, 'on'); ax.GridAlpha = 0.12; title(ax, 'The tank freezes, thrust per kg falls', 'FontWeight', 'normal');
title(tl, sprintf('Hover: %.1f s airborne on a 600 L tank', hover.flight));
savefig_(f, figDir, 'hover');
end

function fig_sweep(figDir, p, tAir, mAir, C)
f = newfig(1000, 520); ax = axes(f);
yyaxis(ax, 'left'); plot(ax, p, tAir, '-o', 'Color', C.frost, 'MarkerFaceColor', C.frost); ylabel(ax, 'hover time airborne (s)');
yyaxis(ax, 'right'); plot(ax, p, mAir, '-s', 'Color', C.amber, 'MarkerFaceColor', C.amber); ylabel(ax, 'air stored (kg)');
xlabel(ax, 'tank pressure (bar)'); grid(ax, 'on'); ax.GridAlpha = 0.12;
title(ax, 'Design trade-off: how much does tank pressure buy you?', 'FontWeight', 'normal');
savefig_(f, figDir, 'pressure_sweep');
end

function fig_upside(figDir, rtl, C)
a = 0:1:180; W = (rtl.dry + rtl.m0)*rtl.g0; S = 8e3*rtl.fanA;
N = S + W*cosd(a); grip = max(N,0)*rtl.mu; need = W*abs(sind(a));
f = newfig(1000, 520); ax = axes(f); hold(ax, 'on');
area(ax, a, grip/1e3, 'FaceColor', C.frost, 'FaceAlpha', 0.15, 'EdgeColor', C.frost, 'LineWidth', 2);
plot(ax, a, need/1e3, 'Color', C.amber);
bad = grip < need; if any(bad), xr = a(bad); patch(ax, [xr(1) xr(end) xr(end) xr(1)], [0 0 60 60], C.bad, 'FaceAlpha', 0.08, 'EdgeColor', 'none'); end
xline(ax, [0 90 180], ':', {'road', 'wall', 'ceiling'}, 'Color', C.muted);
xlabel(ax, 'surface angle (deg)'); ylabel(ax, 'force (kN)'); legend(ax, {'grip available', 'grip needed'}, 'Box', 'off');
if any(bad), sub = sprintf(', but slides between %d° and %d°', xr(1), xr(end)); else, sub = ''; end
title(ax, ['Fan suction 8 kPa: the car holds on a ceiling' sub], 'FontWeight', 'normal');
grid(ax, 'on'); ax.GridAlpha = 0.12; xlim(ax, [0 180]);
savefig_(f, figDir, 'upside_down_grip');
end

function fig_recharge(figDir, rtl, jump, hover, launch, C)
kg = [rtl.m0, jump.air, hover.air, launch.air];
E = kg/1.204*rtl.kwhPerM3; miles = E*1000/rtl.whPerMile;
names = categorical({'Full tank','One jump','One hover','One launch'});
names = reordercats(names, {'Full tank','One jump','One hover','One launch'});
f = newfig(1000, 480); ax = axes(f);
b = barh(ax, names, E, 'FaceColor', 'flat'); b.CData = [C.frost; C.amber; C.amber; C.amber];
for k = 1:4, text(ax, E(k)+0.8, k, sprintf('%.1f kWh, %.0f miles of range', E(k), miles(k)), 'VerticalAlignment', 'middle'); end
set(ax, 'YDir', 'reverse'); xlabel(ax, 'battery energy to refill (kWh)'); xlim(ax, [0 max(E)*1.5]);
title(ax, sprintf('Recharging the air costs range (compressor %.2f kWh per m^3)', rtl.kwhPerM3), 'FontWeight', 'normal');
grid(ax, 'on'); ax.GridAlpha = 0.12;
savefig_(f, figDir, 'recharge_cost');
end

function save_diagrams(figDir)
models = {'RoadsterJump', 'RoadsterHover', 'RoadsterLaunch'};
for k = 1:numel(models)
    try
        load_system(models{k});
        print(['-s' models{k}], '-dpng', '-r150', fullfile(figDir, ['model_' models{k} '.png']));
    catch err
        fprintf('Could not export %s diagram: %s\n', models{k}, err.message);
    end
end
for k = 1:numel(models)
    subs = find_system(models{k}, 'SearchDepth', 1, 'BlockType', 'SubSystem');
    for s = 1:numel(subs)
        nm = regexprep(get_param(subs{s}, 'Name'), '[^A-Za-z0-9]', '');
        if ~any(strcmp(nm, {'MissionManager','FlightController','VehiclePlant'})), continue; end
        try
            if strcmp(nm, 'MissionManager')
                ch = sfroot().find('-isa', 'Stateflow.Chart', 'Path', subs{s});
                sfprint(ch, 'png', fullfile(figDir, 'model_MissionManager_chart.png'));
            else
                print(['-s' subs{s}], '-dpng', '-r150', fullfile(figDir, ['model_' models{k} '_' nm '.png']));
            end
        catch err
            fprintf('Could not export %s: %s\n', subs{s}, err.message);
        end
    end
end
end

% ---------------------------------------------------------------------
function web = web_reference(root)
web = [];
nodes = {'node', '/opt/homebrew/bin/node', '/usr/local/bin/node'};
for k = 1:numel(nodes)
    [st, out] = system(sprintf('"%s" "%s" 2>/dev/null', nodes{k}, fullfile(root, 'web', 'export_reference.js')));
    if st == 0
        i = strfind(out, '{'); 
        if ~isempty(i), web = jsondecode(out(i(1):end)); return; end
    end
end
warning('Node.js not found: skipping the cross-check with the web model.');
end

function write_validation(root, rtl, jump, launch, hover, web)
rows = {
 'Air stored (kg)',                   rtl.m0,           getw(web, 'airMass')
 'Specific impulse at 20 C (s)',      rtl.Isp0,         getw(web, 'isp')
 'Throat for a 13 kN nozzle (mm)',    rtl.throatMm,     getw(web, 'throatMm')
 '0-60 mph, tyres only (s)',          launch.t060(1),   getw(web, 't060', 1)
 '0-60 mph, + fans (s)',              launch.t060(2),   getw(web, 't060', 2)
 '0-60 mph, + fans + thrusters (s)',  launch.t060(3),   getw(web, 't060', 3)
 'Air used by one launch (kg)',       launch.air,       getw(web, 'launchAir')
 'Jump: highest point (m)',           jump.apex,        getw(web, 'jump', 'apex')
 'Jump: closest gap to a vehicle (m)',jump.minClear,    getw(web, 'jump', 'minClear')
 'Jump: time in the air (s)',         jump.airtime,     getw(web, 'jump', 'airtime')
 'Jump: touchdown speed (m/s)',       jump.vLand,       getw(web, 'jump', 'vLand')
 'Jump: air used (kg)',               jump.air,         getw(web, 'jump', 'air')
 'Hover: time airborne (s)',          hover.flight,     getw(web, 'hover', 'flight')
 'Hover: touchdown speed (m/s)',      hover.vTouch,     getw(web, 'hover', 'vTouch')
 'Hover: air used (kg)',              hover.air,        getw(web, 'hover', 'air')
 'Hover: tank gas at touchdown (C)',  hover.Tend,       getw(web, 'hover', 'Tend')
};
fid = fopen(fullfile(root, 'docs', 'validation.md'), 'w');
fprintf(fid, '# Validation: Simulink against the web model\n\n');
fprintf(fid, 'Generated by `matlab/run_all.m` on %s with MATLAB %s. Default parameters (310 bar, 1,900 kg).\n\n', ...
    char(datetime('now', 'Format', 'd MMM yyyy')), version('-release'));
fprintf(fid, '| Quantity | Simulink | Web (physics.js) | Difference |\n|---|---:|---:|---:|\n');
fprintf('\n%-36s %10s %10s %8s\n', 'Quantity', 'Simulink', 'Web', 'Diff');
for k = 1:size(rows,1)
    s = rows{k,2}; w = rows{k,3};
    if isempty(w), wd = 'n/a'; dd = 'n/a';
    else, wd = sprintf('%.2f', w); dd = sprintf('%+.1f%%', 100*(s-w)/max(abs(w), 1e-9)); end
    fprintf(fid, '| %s | %.2f | %s | %s |\n', rows{k,1}, s, wd, dd);
    fprintf('%-36s %10.2f %10s %8s\n', rows{k,1}, s, wd, dd);
end
fprintf(fid, ['\nSmall differences come from the integrators: the web model updates the tank inside each ' ...
    'thruster call and samples at 0.2 to 1 ms, the Simulink models use fixed-step Euler at 1 ms ' ...
    'with a spring-damper ground contact after landing. The larger gap on jump clearance is deliberate: ' ...
    'the web model kicks the car with a small 0.12 rad/s pitch disturbance at lift-off to show the attitude ' ...
    'controller working, which tips the tail about 5 cm lower over the first vehicle.\n']);
fclose(fid);
end

function v = getw(web, varargin)
v = [];
if isempty(web), return; end
x = web;
for k = 1:numel(varargin)
    a = varargin{k};
    if ischar(a)
        if ~isfield(x, a), return; end
        x = x.(a);
    else
        if numel(x) < a, return; end
        x = x(a);
    end
end
v = x;
end
