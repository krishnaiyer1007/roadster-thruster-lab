function rtl = rtl_params(overrides)
%RTL_PARAMS  Parameters for the Roadster Thruster Lab models.
%   rtl = rtl_params() returns the default parameter struct, identical to
%   web/physics.js. rtl = rtl_params(struct('P0bar',400)) overrides fields.
%
%   Tesla-confirmed (15 Oct 2026): 600 L rechargeable air tank, 10 thrusters,
%   rear suction fans. Everything else is a labelled engineering assumption.
%   Units are SI unless the field name says otherwise.

% ---- physical constants
rtl.g0  = 9.80665;     % m/s^2
rtl.R   = 287.05;      % J/(kg K), air
rtl.gam = 1.4;         % ratio of specific heats, air
rtl.Pa  = 101325;      % ambient pressure, Pa

% ---- tank and nozzles (assumed unless noted)
rtl.P0bar   = 310;     % tank pressure, bar
rtl.Pregbar = 100;     % regulated nozzle feed pressure, bar
rtl.V       = 0.600;   % tank volume, m^3 (Tesla: 600 L)
rtl.T0      = 293.15;  % K
rtl.eps     = 8;       % nozzle exit/throat area ratio

% ---- vehicle
rtl.dry  = 1900;       % kg, empty tank
rtl.cg   = 0.55;       % m, centre of mass above ground
rtl.I    = 3500;       % kg m^2, pitch inertia
rtl.arm  = 1.9;        % m, attitude thruster lever arm
rtl.L    = 4.4;        % m, body length

% ---- thruster layout: 2 rear + 4 lift + 4 attitude = 10
rtl.nRear = 2;  rtl.rearKN = 13;
rtl.nLift = 4;  rtl.liftKN = 13;
rtl.nAtt  = 4;  rtl.attKN  = 5;

% ---- launch
rtl.mu = 1.3; rtl.motorKW = 950; rtl.fanKPa = 6; rtl.CdA = 0.55; rtl.crr = 0.012;
rtl.fanA = 3.0; rtl.fanPerim = 11.6; rtl.fanCd = 0.6; rtl.fanEta = 0.6; rtl.gapMm = 5;

% ---- jump
rtl.v0 = 22; rtl.burn = 0.5; rtl.spin = 0;
rtl.Kp = 64; rtl.Kd = 16;                 % attitude PD, 1/s^2 and 1/s

% ---- hover
rtl.hoverAlt = 1.5;

% ---- recharge
rtl.kwhPerM3 = 0.35; rtl.compKW = 20; rtl.whPerMile = 330;

if nargin > 0
    f = fieldnames(overrides);
    for k = 1:numel(f), rtl.(f{k}) = overrides.(f{k}); end
end

% ---- derived quantities (recomputed after overrides)
rtl.P0   = rtl.P0bar * 1e5;
rtl.Preg = rtl.Pregbar * 1e5;
Z        = 1 + 0.00039 * rtl.P0bar;                         % compressibility near 20 C
rtl.m0   = rtl.P0 * rtl.V / (Z * rtl.R * rtl.T0);          % kg of air stored
g = rtl.gam;
rtl.CK   = (2/(g+1))^((g+1)/(2*(g-1)));
Me       = fzero(@(M) (1./M).*((2/(g+1))*(1+(g-1)/2*M.^2)).^((g+1)/(2*(g-1))) - rtl.eps, [1.0001 12]);
rtl.Me   = Me;
rtl.PR   = (1 + (g-1)/2*Me^2)^(-g/(g-1));                  % exit / chamber pressure
rtl.CFm  = sqrt(2*g^2/(g-1) * (2/(g+1))^((g+1)/(g-1)) * (1 - rtl.PR^((g-1)/g)));
rtl.Cf0  = rtl.CFm + (rtl.Preg*rtl.PR - rtl.Pa)/rtl.Preg*rtl.eps;
rtl.Isp0 = rtl.Cf0 * sqrt(rtl.R*rtl.T0/g)/rtl.CK / rtl.g0;
rtl.FliftMax = rtl.nLift * rtl.liftKN * 1e3;
rtl.FrearMax = rtl.nRear * rtl.rearKN * 1e3;
rtl.Tmax     = 2 * rtl.attKN * 1e3 * rtl.arm;               % max pitch torque
rtl.Dspin    = max(0.6, sqrt(1.15*5.774*2*pi*rtl.I/rtl.Tmax)); % shortest 360 deg flip
rtl.throatMm = 1e3*sqrt(4*rtl.liftKN*1e3/(rtl.Cf0*rtl.Preg)/pi);

% ---- obstacle row for the jump (typical sizes): [x0 x1 height]
Ls = [4.2 5.7 7.0 4.75 4.7]; Hs = [1.50 1.90 4.10 1.62 1.44];
x = 0; obs = zeros(5,3);
for k = 1:5, obs(k,:) = [x, x+Ls(k), Hs(k)]; x = x + Ls(k) + 0.6; end
rtl.obs = obs;   % names: Robotaxi, Pickup, Semi tractor, SUV, Saloon
end
