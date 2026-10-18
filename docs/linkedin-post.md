# LinkedIn post draft

Tesla made the new Roadster jump over five cars last week. So I rebuilt the physics to see how it works. 🚀

The car uses SpaceX cold-gas thrusters. No fuel, no fire. Just air squeezed into a 600 litre tank and fired out of 10 nozzles.

I modelled it twice: an interactive web simulator, and a full MATLAB/Simulink model with a Stateflow flight computer. The two agree to within about 1%.

What surprised me:

🔹 Tyres alone can't beat about 2.1 s to 60 mph. Grip is the wall, not power. Two rear thrusters take it to 0.77 s.
🔹 The jump is half a second of thrust, then the car is basically a thrown ball. A landing burn sets it down at about 1 m/s.
🔹 Hover lasts about 4.5 seconds. Holding up a two-tonne car burns around 30 kg of air every second.
🔹 The tank gets to roughly −99 °C as it empties, and cold air pushes less.
🔹 Refilling the tank could cost about 170 miles of battery range.

Tesla hasn't published every number, so anything assumed is labelled. Try changing the tank pressure and watch the whole thing re-run.

🔗 Live model: [GitHub Pages link]
💻 Code: [GitHub repo link]

#Engineering #MATLAB #Simulink #ControlSystems #Tesla #SpaceX #Physics #Simulation
