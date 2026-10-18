function plan = rtl_plan_jump(rtl)
%RTL_PLAN_JUMP  Where to start the lift burn so the car clears the first vehicle.
%   Same rule as planJump() in web/physics.js: find the earliest time after
%   burn start at which the lowest point of the car is 0.25 m above the first
%   vehicle, then start the burn that far (at approach speed) before the row.

m   = rtl.dry + rtl.m0;
a   = rtl.FliftMax/m - rtl.g0;                   % net upward acceleration during the burn
vyb = a*rtl.burn;  yb = 0.5*a*rtl.burn^2;
t   = 0:0.002:4;
h   = (t <= rtl.burn).*(0.5*a*t.^2) + ...
      (t >  rtl.burn).*(yb + vyb*(t-rtl.burn) - 0.5*rtl.g0*(t-rtl.burn).^2);
k   = find(h >= rtl.obs(1,3) + 0.25, 1);
if isempty(k), tc = rtl.burn + max(vyb,0)/rtl.g0; else, tc = t(k); end
plan.xBurn  = rtl.obs(1,1) - rtl.L/2 - rtl.v0*tc;
plan.xStart = plan.xBurn - 14;
plan.aUp = a; plan.vyb = vyb;
end
